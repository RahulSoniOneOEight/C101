import 'dart:async';
import 'dart:convert';

import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

import '../core/app_config.dart';
import '../data/experience_api.dart';
import '../domain/workspace_models.dart';
import '../providers/workspace_providers.dart';

/// B2B collaborative workspace — Phase 1 conversation surface.
///
/// Workspaces, channels and messages are durable server projections. Purchase
/// drafts, proposals, approvals and checkout handoff are Phase 2 and are not
/// available here; the banner makes that boundary visible.
class WorkspaceScreen extends ConsumerStatefulWidget {
  const WorkspaceScreen({super.key});

  @override
  ConsumerState<WorkspaceScreen> createState() => _WorkspaceScreenState();
}

class _WorkspaceScreenState extends ConsumerState<WorkspaceScreen> {
  final TextEditingController _composer = TextEditingController();
  final ScrollController _scroll = ScrollController();

  List<WorkspaceSummary> _workspaces = const <WorkspaceSummary>[];
  List<WorkspaceChannel> _channels = const <WorkspaceChannel>[];
  List<WorkspaceMessage> _messages = const <WorkspaceMessage>[];
  WorkspaceSummary? _workspace;
  WorkspaceChannel? _channel;
  String? _cursor;
  bool _loading = true;
  bool _sending = false;
  String? _error;
  Timer? _poll;
  WebSocketChannel? _stream;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _poll?.cancel();
    _stream?.sink.close();
    _composer.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final api = ref.read(experienceApiProvider);
      final workspaces = await api.getWorkspaces();
      if (!mounted) return;
      if (workspaces.isEmpty) {
        setState(() {
          _workspaces = const <WorkspaceSummary>[];
          _loading = false;
        });
        return;
      }
      final workspace = workspaces.first;
      final channels = await api.getWorkspaceChannels(workspace.id);
      if (!mounted) return;
      final channel =
          channels.where((c) => c.kind == 'procurement').firstOrNull ??
              channels.firstOrNull;
      setState(() {
        _workspaces = workspaces;
        _workspace = workspace;
        _channels = channels;
        _channel = channel;
        _loading = false;
      });
      if (channel != null) await _loadMessages(channel);
      await _connectStream();
      _startPolling();
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = _friendlyError(error);
      });
    }
  }

  Future<void> _selectWorkspace(WorkspaceSummary workspace) async {
    _poll?.cancel();
    setState(() {
      _workspace = workspace;
      _channels = const <WorkspaceChannel>[];
      _channel = null;
      _messages = const <WorkspaceMessage>[];
    });
    try {
      final channels = await ref
          .read(experienceApiProvider)
          .getWorkspaceChannels(workspace.id);
      if (!mounted) return;
      final channel =
          channels.where((c) => c.kind == 'procurement').firstOrNull ??
              channels.firstOrNull;
      setState(() {
        _channels = channels;
        _channel = channel;
      });
      if (channel != null) await _loadMessages(channel);
      await _connectStream();
      _startPolling();
    } catch (error) {
      if (mounted) setState(() => _error = _friendlyError(error));
    }
  }

  Future<void> _selectChannel(WorkspaceChannel channel) async {
    if (channel.id == _channel?.id) return;
    setState(() {
      _channel = channel;
      _messages = const <WorkspaceMessage>[];
      _cursor = null;
    });
    await _loadMessages(channel);
  }

  Future<void> _loadMessages(WorkspaceChannel channel) async {
    try {
      final page = await ref
          .read(experienceApiProvider)
          .getWorkspaceMessages(channel.id);
      if (!mounted) return;
      setState(() {
        _messages = page.messages;
        _cursor = page.nextCursor;
      });
      await _markRead(channel, page.messages);
      _scrollToBottom();
    } catch (error) {
      if (mounted) setState(() => _error = _friendlyError(error));
    }
  }

  Future<void> _pollMessages() async {
    final channel = _channel;
    if (channel == null || _sending) return;
    try {
      final page = await ref
          .read(experienceApiProvider)
          .getWorkspaceMessages(channel.id, cursor: _cursor);
      if (!mounted || page.messages.isEmpty) return;
      final known = _messages.map((message) => message.id).toSet();
      final fresh = page.messages
          .where((message) => !known.contains(message.id))
          .toList();
      if (fresh.isEmpty) return;
      setState(() {
        _messages = <WorkspaceMessage>[..._messages, ...fresh];
        _cursor = page.nextCursor;
      });
      await _markRead(channel, fresh);
      _scrollToBottom();
    } catch (_) {
      // Polling is best-effort; the manual refresh and send paths show errors.
    }
  }

  void _startPolling() {
    _poll?.cancel();
    _poll = Timer.periodic(const Duration(seconds: 6), (_) => _pollMessages());
  }

  Future<void> _connectStream() async {
    final workspace = _workspace;
    final channel = _channel;
    if (workspace == null || channel == null) return;
    try {
      await _stream?.sink.close();
      _stream = null;
      final ticket = await ref
          .read(experienceApiProvider)
          .createWorkspaceStreamTicket(workspace.id);
      if (!mounted || _workspace?.id != workspace.id) return;
      final base = AppConfig.experienceApiBaseUrl
          .replaceFirst(RegExp(r'^https'), 'wss')
          .replaceFirst(RegExp(r'^http'), 'ws');
      final uri = Uri.parse('$base/v1/workspaces/${workspace.id}/stream')
          .replace(queryParameters: <String, String>{
        'ticket': ticket.ticket,
        'signature': ticket.signature,
        'cursor': _cursor ?? '0',
      });
      final socket = WebSocketChannel.connect(uri);
      _stream = socket;
      socket.stream.listen(
        _onStreamEvent,
        onDone: () => _stream = null,
        onError: (_) => _stream = null,
        cancelOnError: true,
      );
    } catch (_) {
      // REST polling remains available when the realtime feed cannot connect.
      _stream = null;
    }
  }

  void _onStreamEvent(dynamic raw) {
    if (raw is! String) return;
    try {
      final payload = jsonDecode(raw);
      if (payload is! Map<String, dynamic>) return;
      if (payload['type'] != 'message.created') return;
      final messageJson = payload['message'];
      if (messageJson is! Map<String, dynamic>) return;
      final message = WorkspaceMessage.fromJson(messageJson);
      final channel = _channel;
      if (channel == null || message.channelId != channel.id) return;
      if (_messages.any((existing) => existing.id == message.id)) return;
      setState(() {
        _messages = <WorkspaceMessage>[..._messages, message];
        _cursor = '${message.sequence}';
      });
      _markRead(channel, <WorkspaceMessage>[message]);
      _scrollToBottom();
    } catch (_) {
      // Ignore malformed or non-message frames; polling still reconciles.
    }
  }

  Future<void> _markRead(
    WorkspaceChannel channel,
    List<WorkspaceMessage> messages,
  ) async {
    final last = messages.isEmpty ? 0 : messages.last.sequence;
    if (last <= 0) return;
    try {
      await ref.read(experienceApiProvider).markWorkspaceRead(channel.id, last);
      ref.invalidate(workspaceUnreadCountProvider);
    } catch (_) {
      // Unread state is non-critical; never block the conversation.
    }
  }

  Future<void> _send() async {
    final channel = _channel;
    final text = _composer.text.trim();
    if (channel == null || text.isEmpty || _sending) return;
    setState(() => _sending = true);
    try {
      final sent = await ref
          .read(experienceApiProvider)
          .sendWorkspaceMessage(channel.id, text);
      if (!mounted) return;
      _composer.clear();
      setState(() {
        if (!_messages.any((message) => message.id == sent.id)) {
          _messages = <WorkspaceMessage>[..._messages, sent];
        }
        _cursor = '${sent.sequence}';
      });
      await _markRead(channel, <WorkspaceMessage>[sent]);
      _scrollToBottom();
    } catch (error) {
      if (mounted) {
        setState(() => _error = _friendlyError(error));
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_scroll.hasClients) return;
      _scroll.animateTo(
        _scroll.position.maxScrollExtent,
        duration: const Duration(milliseconds: 220),
        curve: Curves.easeOut,
      );
    });
  }

  String _friendlyError(Object error) {
    if (error is DioException) {
      final data = error.response?.data;
      if (data is Map && data['detail'] is String) {
        return data['detail'] as String;
      }
      if (error.response?.statusCode == 403) {
        return 'This workspace is available to business accounts only.';
      }
      if (error.response?.statusCode == 404) {
        return 'This workspace is not available for your account.';
      }
    }
    return 'Could not load the workspace. Please retry.';
  }

  @override
  Widget build(BuildContext context) {
    final colors =
        Theme.of(context).extension<AgencyColors>() ?? AgencyColors.light;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Workspace'),
        actions: <Widget>[
          IconButton(
            tooltip: 'Refresh',
            onPressed: _loading ? null : _load,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: Column(
        children: <Widget>[
          _phaseBanner(colors),
          if (_workspace != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(
                  AgencySpacing.md, AgencySpacing.sm, AgencySpacing.md, 0),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  _workspace!.name,
                  style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: colors.contentPrimary),
                ),
              ),
            ),
          if (_workspaces.length > 1) _workspacePicker(colors),
          if (_channels.isNotEmpty) _channelPicker(colors),
          Expanded(child: _body(colors)),
          _composerBar(colors),
        ],
      ),
    );
  }

  Widget _phaseBanner(AgencyColors colors) => Container(
        width: double.infinity,
        margin: const EdgeInsets.fromLTRB(
            AgencySpacing.md, AgencySpacing.sm, AgencySpacing.md, 0),
        padding: const EdgeInsets.all(AgencySpacing.sm),
        decoration: BoxDecoration(
          color: colors.surfaceInteractive,
          borderRadius: BorderRadius.circular(AgencyRadius.md),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Icon(Icons.science_outlined, size: 17, color: colors.actionPrimary),
            const SizedBox(width: AgencySpacing.sm),
            Expanded(
              child: Text(
                'Staging pilot · Phase 1 conversation only. Drafts, approvals and checkout are not available here yet.',
                style: TextStyle(
                    fontSize: 10, height: 1.35, color: colors.contentSecondary),
              ),
            ),
          ],
        ),
      );

  Widget _workspacePicker(AgencyColors colors) => Padding(
        padding: const EdgeInsets.fromLTRB(
            AgencySpacing.md, AgencySpacing.sm, AgencySpacing.md, 0),
        child: DropdownButtonHideUnderline(
          child: DropdownButton<String>(
            isExpanded: true,
            value: _workspace?.id,
            hint: const Text('Select workspace'),
            items: <DropdownMenuItem<String>>[
              for (final workspace in _workspaces)
                DropdownMenuItem<String>(
                  value: workspace.id,
                  child: Text(workspace.name,
                      style: TextStyle(
                          fontSize: 13, color: colors.contentPrimary)),
                ),
            ],
            onChanged: (id) {
              final workspace =
                  _workspaces.where((item) => item.id == id).firstOrNull;
              if (workspace != null) _selectWorkspace(workspace);
            },
          ),
        ),
      );

  Widget _channelPicker(AgencyColors colors) => Padding(
        padding: const EdgeInsets.fromLTRB(
            AgencySpacing.md, AgencySpacing.sm, AgencySpacing.md, 0),
        child: Row(
          children: <Widget>[
            for (final channel in _channels) ...<Widget>[
              ChoiceChip(
                label: Text(channel.name, style: const TextStyle(fontSize: 12)),
                selected: channel.id == _channel?.id,
                onSelected: (_) => _selectChannel(channel),
              ),
              const SizedBox(width: AgencySpacing.xs),
            ],
          ],
        ),
      );

  Widget _body(AgencyColors colors) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(AgencySpacing.lg),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              Icon(Icons.cloud_off_outlined,
                  size: 34, color: colors.contentSecondary),
              const SizedBox(height: AgencySpacing.sm),
              Text(_error!,
                  textAlign: TextAlign.center,
                  style:
                      TextStyle(fontSize: 13, color: colors.contentSecondary)),
              const SizedBox(height: AgencySpacing.md),
              FilledButton(onPressed: _load, child: const Text('Retry')),
            ],
          ),
        ),
      );
    }
    if (_workspaces.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(AgencySpacing.lg),
          child: Text(
            'No workspace is available for this account.',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 13, color: colors.contentSecondary),
          ),
        ),
      );
    }
    if (_messages.isEmpty) {
      return Center(
        child: Text(
          'No messages yet. Start the procurement conversation.',
          style: TextStyle(fontSize: 13, color: colors.contentSecondary),
        ),
      );
    }
    final api = ref.read(experienceApiProvider);
    return ListView.builder(
      controller: _scroll,
      padding: const EdgeInsets.all(AgencySpacing.md),
      itemCount: _messages.length,
      itemBuilder: (context, index) {
        final message = _messages[index];
        if (message.isCommerceEvent) return _eventStrip(colors, message);
        final mine =
            api.sessionUserId != null && message.actorId == api.sessionUserId;
        return _bubble(colors, message, mine);
      },
    );
  }

  Widget _bubble(AgencyColors colors, WorkspaceMessage message, bool mine) {
    final time = message.createdAt?.toLocal();
    final timeLabel = time == null
        ? ''
        : '${time.hour.toString().padLeft(2, '0')}:${time.minute.toString().padLeft(2, '0')}';
    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        constraints: const BoxConstraints(maxWidth: 320),
        margin: const EdgeInsets.symmetric(vertical: 3),
        padding: const EdgeInsets.symmetric(
            horizontal: AgencySpacing.md, vertical: AgencySpacing.sm),
        decoration: BoxDecoration(
          color: mine ? colors.actionPrimary : colors.surfaceInteractive,
          borderRadius: BorderRadius.circular(AgencyRadius.md),
        ),
        child: Column(
          crossAxisAlignment:
              mine ? CrossAxisAlignment.end : CrossAxisAlignment.start,
          children: <Widget>[
            if (!mine)
              Text(message.actorName,
                  style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      color: colors.actionPrimary)),
            Text(message.body,
                style: TextStyle(
                    fontSize: 13,
                    height: 1.35,
                    color:
                        mine ? colors.contentInverse : colors.contentPrimary)),
            if (timeLabel.isNotEmpty)
              Text(timeLabel,
                  style: TextStyle(
                      fontSize: 9,
                      color: mine
                          ? colors.contentInverse.withValues(alpha: 0.7)
                          : colors.contentSecondary)),
          ],
        ),
      ),
    );
  }

  Widget _eventStrip(AgencyColors colors, WorkspaceMessage message) =>
      Container(
        width: double.infinity,
        margin: const EdgeInsets.symmetric(vertical: AgencySpacing.xs),
        padding: const EdgeInsets.all(AgencySpacing.sm),
        decoration: BoxDecoration(
          color: colors.surfaceRaised,
          border: Border(
            top: BorderSide(color: colors.borderDefault),
            bottom: BorderSide(color: colors.borderDefault),
          ),
        ),
        child: Row(
          children: <Widget>[
            Icon(Icons.inventory_2_outlined,
                size: 17, color: colors.actionPrimary),
            const SizedBox(width: AgencySpacing.sm),
            Expanded(
              child: Text(message.body,
                  style:
                      TextStyle(fontSize: 11, color: colors.contentSecondary)),
            ),
          ],
        ),
      );

  Widget _composerBar(AgencyColors colors) => SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.all(AgencySpacing.md),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: <Widget>[
              Expanded(
                child: TextField(
                  controller: _composer,
                  minLines: 1,
                  maxLines: 4,
                  textInputAction: TextInputAction.send,
                  onSubmitted: (_) => _send(),
                  decoration: InputDecoration(
                    hintText: 'Message the procurement team',
                    filled: true,
                    fillColor: colors.surfacePage,
                    contentPadding: const EdgeInsets.symmetric(
                        horizontal: AgencySpacing.md, vertical: 10),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(AgencyRadius.lg),
                      borderSide: BorderSide.none,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: AgencySpacing.sm),
              IconButton.filled(
                onPressed: _sending ? null : _send,
                tooltip: 'Send message',
                icon: _sending
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.send),
                style: IconButton.styleFrom(
                  backgroundColor: colors.actionPrimary,
                  minimumSize: const Size(44, 44),
                ),
              ),
            ],
          ),
        ),
      );
}
