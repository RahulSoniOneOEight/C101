import 'dart:async';
import 'dart:convert';

import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

import '../core/app_config.dart';
import '../data/experience_api.dart';
import '../domain/models.dart' show Money;
import '../domain/workspace_models.dart';
import '../providers/workspace_providers.dart';

/// B2B collaborative workspace — Phase 2 conversation and purchase-draft surface.
///
/// Workspaces, channels, messages, immutable draft revisions, proposals and
/// revision-bound approvals are durable server projections. Catalogue-price
/// revalidation and checkout handoff remain Phase 3; every draft is visibly
/// marked as staging data.
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
  WorkspaceDraftView? _draftView;
  String? _cursor;
  int _surface = 0;
  bool _loading = true;
  bool _sending = false;
  bool _draftLoading = false;
  bool _draftBusy = false;
  bool _live = false;
  String? _error;
  String? _draftError;
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
      await _loadDraft(workspace.id);
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

  Future<void> _loadDraft(String workspaceId) async {
    setState(() {
      _draftLoading = true;
      _draftError = null;
    });
    try {
      final api = ref.read(experienceApiProvider);
      final drafts = await api.getWorkspaceDrafts(workspaceId);
      WorkspaceDraftView? view;
      if (drafts.isNotEmpty) {
        view = await api.getWorkspaceDraft(drafts.first.id);
      }
      if (!mounted || _workspace?.id != workspaceId) return;
      setState(() {
        _draftView = view;
        _draftLoading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _draftLoading = false;
        _draftError = _friendlyError(error);
      });
    }
  }

  Future<void> _runDraftAction(Future<void> Function() action) async {
    if (_draftBusy) return;
    setState(() {
      _draftBusy = true;
      _draftError = null;
    });
    try {
      await action();
      final workspace = _workspace;
      if (workspace != null) await _loadDraft(workspace.id);
    } catch (error) {
      if (mounted) setState(() => _draftError = _friendlyError(error));
    } finally {
      if (mounted) setState(() => _draftBusy = false);
    }
  }

  Future<void> _proposeQuantity(DraftLine line, int delta) async {
    final view = _draftView;
    final revision = view?.revision;
    if (view == null || revision == null) return;
    final quantity = line.quantity + delta;
    if (quantity < 1) return;
    await _runDraftAction(
      () => ref.read(experienceApiProvider).proposeDraftChange(
        draftId: view.draft.id,
        expectedVersion: revision.version,
        kind: 'update_quantity',
        payload: <String, dynamic>{
          'line_key': line.lineKey,
          'quantity': quantity,
        },
      ),
    );
  }

  Future<void> _acceptProposal(DraftProposal proposal) => _runDraftAction(
        () => ref.read(experienceApiProvider).acceptProposal(proposal.id),
      );

  Future<void> _rejectProposal(DraftProposal proposal) => _runDraftAction(
        () => ref.read(experienceApiProvider).rejectProposal(proposal.id),
      );

  Future<void> _requestApproval() async {
    final view = _draftView;
    final revision = view?.revision;
    if (view == null || revision == null) return;
    await _runDraftAction(
      () => ref.read(experienceApiProvider).requestDraftApproval(
            draftId: view.draft.id,
            expectedVersion: revision.version,
            revisionId: revision.id,
            commercialHash: revision.commercialHash,
            comment: 'Please review revision ${revision.version}.',
          ),
    );
  }

  Future<void> _decideApproval(String action) async {
    final approval = _draftView?.approval;
    if (approval == null) return;
    String? comment;
    if (action == 'request-changes') {
      comment = await _commentDialog();
      if (comment == null) return;
    }
    await _runDraftAction(
      () => ref.read(experienceApiProvider).decideDraftApproval(
            approval.id,
            action,
            comment: comment,
          ),
    );
  }

  Future<String?> _commentDialog() async {
    final controller = TextEditingController();
    final result = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Request changes'),
        content: TextField(
          controller: controller,
          autofocus: true,
          minLines: 2,
          maxLines: 4,
          decoration: const InputDecoration(
            labelText: 'What should change?',
            hintText: 'e.g. Reduce the board quantity to 3.',
          ),
        ),
        actions: <Widget>[
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () {
              final text = controller.text.trim();
              if (text.isNotEmpty) Navigator.of(context).pop(text);
            },
            child: const Text('Send'),
          ),
        ],
      ),
    );
    controller.dispose();
    return result;
  }

  Future<void> _selectWorkspace(WorkspaceSummary workspace) async {
    _poll?.cancel();
    setState(() {
      _workspace = workspace;
      _channels = const <WorkspaceChannel>[];
      _channel = null;
      _messages = const <WorkspaceMessage>[];
      _draftView = null;
      _draftError = null;
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
      await _loadDraft(workspace.id);
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
      socket.ready.then((_) {
        if (mounted && _stream == socket) setState(() => _live = true);
      }).catchError((_) {
        if (mounted) setState(() => _live = false);
      });
      socket.stream.listen(
        _onStreamEvent,
        onDone: () {
          _stream = null;
          if (mounted) setState(() => _live = false);
        },
        onError: (_) {
          _stream = null;
          if (mounted) setState(() => _live = false);
        },
        cancelOnError: true,
      );
    } catch (_) {
      // REST polling remains available when the realtime feed cannot connect.
      _stream = null;
      if (mounted) setState(() => _live = false);
    }
  }

  void _onStreamEvent(dynamic raw) {
    if (raw is! String) return;
    try {
      final payload = jsonDecode(raw);
      if (payload is! Map<String, dynamic>) return;
      if (payload['type'] == 'draft.updated') {
        final workspace = _workspace;
        if (workspace != null && payload['workspace_id'] == workspace.id) {
          _loadDraft(workspace.id);
        }
        return;
      }
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
          if (_workspace != null) _surfacePicker(colors),
          if (_surface == 0 && _channels.isNotEmpty) _channelPicker(colors),
          Expanded(
            child: _surface == 0 ? _body(colors) : _draftBody(colors),
          ),
          if (_surface == 0) _composerBar(colors),
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
                'Staging pilot · conversation, purchase drafts and revision-bound approvals. Cart build is explicit and revalidated; checkout remains a separate step.',
                style: TextStyle(
                    fontSize: 10, height: 1.35, color: colors.contentSecondary),
              ),
            ),
            const SizedBox(width: AgencySpacing.xs),
            Row(
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                Icon(
                  Icons.circle,
                  size: 8,
                  color:
                      _live ? colors.feedbackSuccess : colors.contentSecondary,
                ),
                const SizedBox(width: 3),
                Text(
                  _live ? 'Live' : 'Polling',
                  style: TextStyle(
                      fontSize: 9,
                      fontWeight: FontWeight.w600,
                      color: _live
                          ? colors.feedbackSuccess
                          : colors.contentSecondary),
                ),
              ],
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

  Widget _surfacePicker(AgencyColors colors) => Padding(
        padding: const EdgeInsets.fromLTRB(
            AgencySpacing.md, AgencySpacing.sm, AgencySpacing.md, 0),
        child: Row(
          children: <Widget>[
            Expanded(
              child: ChoiceChip(
                label: const SizedBox(
                  width: double.infinity,
                  child: Text('Conversation',
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 12)),
                ),
                selected: _surface == 0,
                onSelected: (_) => setState(() => _surface = 0),
              ),
            ),
            const SizedBox(width: AgencySpacing.sm),
            Expanded(
              child: ChoiceChip(
                label: const SizedBox(
                  width: double.infinity,
                  child: Text('Purchase draft',
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 12)),
                ),
                selected: _surface == 1,
                onSelected: (_) => setState(() => _surface = 1),
              ),
            ),
          ],
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

  Widget _draftBody(AgencyColors colors) {
    if (_draftLoading && _draftView == null) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_draftError != null && _draftView == null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(AgencySpacing.lg),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              Icon(Icons.description_outlined,
                  size: 34, color: colors.contentSecondary),
              const SizedBox(height: AgencySpacing.sm),
              Text(_draftError!,
                  textAlign: TextAlign.center,
                  style:
                      TextStyle(fontSize: 13, color: colors.contentSecondary)),
              const SizedBox(height: AgencySpacing.md),
              FilledButton(
                onPressed: () {
                  final workspace = _workspace;
                  if (workspace != null) _loadDraft(workspace.id);
                },
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
      );
    }
    final view = _draftView;
    if (view == null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(AgencySpacing.lg),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              Icon(Icons.note_add_outlined,
                  size: 34, color: colors.contentSecondary),
              const SizedBox(height: AgencySpacing.sm),
              Text(
                'No purchase draft in this workspace yet.',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 13, color: colors.contentSecondary),
              ),
              const SizedBox(height: AgencySpacing.xs),
              Text(
                'Product shares and drafts will appear here once the procurement team starts one.',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 11, color: colors.contentSecondary),
              ),
            ],
          ),
        ),
      );
    }
    final revision = view.revision;
    return RefreshIndicator(
      onRefresh: () async {
        final workspace = _workspace;
        if (workspace != null) await _loadDraft(workspace.id);
      },
      child: ListView(
        padding: const EdgeInsets.all(AgencySpacing.md),
        children: <Widget>[
          _draftHeader(colors, view),
          if (_draftError != null) ...<Widget>[
            const SizedBox(height: AgencySpacing.sm),
            _inlineError(colors, _draftError!),
          ],
          const SizedBox(height: AgencySpacing.md),
          if (revision == null)
            Text(
              'This draft has no revision yet.',
              style: TextStyle(fontSize: 12, color: colors.contentSecondary),
            )
          else ...<Widget>[
            Row(
              children: <Widget>[
                Expanded(
                  child: Text(
                    'Lines · ${revision.lineCount}',
                    style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: colors.contentPrimary),
                  ),
                ),
                Text(
                  'v${revision.version}',
                  style:
                      TextStyle(fontSize: 11, color: colors.contentSecondary),
                ),
              ],
            ),
            const SizedBox(height: AgencySpacing.sm),
            for (final line in revision.lines) ...<Widget>[
              _draftLineCard(colors, view, line),
              const SizedBox(height: AgencySpacing.sm),
            ],
            _draftTotal(colors, revision),
          ],
          if (view.proposals.isNotEmpty) ...<Widget>[
            const SizedBox(height: AgencySpacing.lg),
            Text(
              'Proposals',
              style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: colors.contentPrimary),
            ),
            const SizedBox(height: AgencySpacing.sm),
            for (final proposal in view.proposals.take(3)) ...<Widget>[
              _proposalCard(colors, view, proposal),
              const SizedBox(height: AgencySpacing.sm),
            ],
            if (view.proposals.length > 3)
              Text(
                '${view.proposals.length - 3} earlier proposals remain in the '
                'append-only activity history.',
                style: TextStyle(fontSize: 10, color: colors.contentSecondary),
              ),
          ],
          const SizedBox(height: AgencySpacing.lg),
          _approvalCard(colors, view),
          const SizedBox(height: AgencySpacing.lg),
          Text(
            'Prices are immutable staging snapshots. Cart build revalidates '
            'availability, seller, MOQ and price before adding; checkout and '
            'order creation remain separate.',
            style: TextStyle(
                fontSize: 10, height: 1.35, color: colors.contentSecondary),
          ),
        ],
      ),
    );
  }

  Widget _draftHeader(AgencyColors colors, WorkspaceDraftView view) {
    final draft = view.draft;
    return Container(
      padding: const EdgeInsets.all(AgencySpacing.md),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(AgencyRadius.md),
        border: Border.all(color: colors.borderDefault),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(
            draft.name,
            style: TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w700,
                color: colors.contentPrimary),
          ),
          const SizedBox(height: AgencySpacing.xs),
          Wrap(
            spacing: AgencySpacing.xs,
            runSpacing: AgencySpacing.xs,
            children: <Widget>[
              _pill(colors, _label(draft.lifecycleStatus),
                  _statusColor(colors, draft.lifecycleStatus)),
              _pill(colors, 'You: ${draft.role}', colors.contentSecondary),
              _pill(colors, 'Staging data', colors.feedbackWarning),
            ],
          ),
        ],
      ),
    );
  }

  Widget _draftLineCard(
    AgencyColors colors,
    WorkspaceDraftView view,
    DraftLine line,
  ) {
    final draft = view.draft;
    final canEdit = draft.canEdit && !_draftBusy;
    return Container(
      padding: const EdgeInsets.all(AgencySpacing.md),
      decoration: BoxDecoration(
        color: colors.surfacePage,
        borderRadius: BorderRadius.circular(AgencyRadius.md),
        border: Border.all(color: colors.borderDefault),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(
            line.productTitle,
            style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: colors.contentPrimary),
          ),
          if (line.sellerName.isNotEmpty) ...<Widget>[
            const SizedBox(height: 2),
            Text(
              line.sellerName,
              style: TextStyle(fontSize: 10, color: colors.contentSecondary),
            ),
          ],
          const SizedBox(height: AgencySpacing.sm),
          Row(
            children: <Widget>[
              Expanded(
                child: Text(
                  '${Money(amount: line.unitAmountMinor, currencyCode: line.currencyCode).formatted} each',
                  style:
                      TextStyle(fontSize: 11, color: colors.contentSecondary),
                ),
              ),
              Text(
                Money(
                        amount: line.lineTotalMinor,
                        currencyCode: line.currencyCode)
                    .formatted,
                style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: colors.contentPrimary),
              ),
            ],
          ),
          if (line.materialInstruction != null &&
              line.materialInstruction!.isNotEmpty) ...<Widget>[
            const SizedBox(height: AgencySpacing.xs),
            Text(
              'Instruction: ${line.materialInstruction}',
              style: TextStyle(fontSize: 10, color: colors.contentSecondary),
            ),
          ],
          const SizedBox(height: AgencySpacing.sm),
          Row(
            children: <Widget>[
              Container(
                padding: const EdgeInsets.symmetric(
                    horizontal: AgencySpacing.sm, vertical: 6),
                decoration: BoxDecoration(
                  color: colors.surfaceInteractive,
                  borderRadius: BorderRadius.circular(AgencyRadius.sm),
                ),
                child: Text(
                  'Qty ${line.quantity}',
                  style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: colors.contentPrimary),
                ),
              ),
              const Spacer(),
              if (canEdit)
                Wrap(
                  spacing: AgencySpacing.xs,
                  children: <Widget>[
                    OutlinedButton(
                      onPressed: line.quantity <= 1
                          ? null
                          : () => _proposeQuantity(line, -1),
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size(44, 44),
                        padding: EdgeInsets.zero,
                      ),
                      child: const Icon(Icons.remove, size: 18),
                    ),
                    OutlinedButton(
                      onPressed: () => _proposeQuantity(line, 1),
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size(44, 44),
                        padding: EdgeInsets.zero,
                      ),
                      child: const Icon(Icons.add, size: 18),
                    ),
                  ],
                ),
            ],
          ),
          if (canEdit)
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Text(
                'Quantity changes become proposals for explicit acceptance.',
                style: TextStyle(fontSize: 9, color: colors.contentSecondary),
              ),
            ),
        ],
      ),
    );
  }

  Widget _draftTotal(AgencyColors colors, DraftRevision revision) => Padding(
        padding: const EdgeInsets.only(top: AgencySpacing.xs),
        child: Row(
          children: <Widget>[
            Expanded(
              child: Text(
                'Draft subtotal',
                style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: colors.contentSecondary),
              ),
            ),
            Text(
              Money(amount: revision.totalMinor, currencyCode: 'INR').formatted,
              style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: colors.contentPrimary),
            ),
          ],
        ),
      );

  Widget _proposalCard(
    AgencyColors colors,
    WorkspaceDraftView view,
    DraftProposal proposal,
  ) {
    final canDecide =
        view.draft.canDecideProposal && proposal.isPending && !_draftBusy;
    return Container(
      padding: const EdgeInsets.all(AgencySpacing.sm),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(AgencyRadius.md),
        border: Border.all(color: colors.borderDefault),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              Expanded(
                child: Text(
                  _proposalTitle(proposal),
                  style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: colors.contentPrimary),
                ),
              ),
              _pill(colors, proposal.status,
                  _statusColor(colors, proposal.status)),
            ],
          ),
          const SizedBox(height: 2),
          Text(
            'Proposed by ${proposal.proposedBy} · based on v${proposal.expectedVersion}',
            style: TextStyle(fontSize: 10, color: colors.contentSecondary),
          ),
          if (canDecide) ...<Widget>[
            const SizedBox(height: AgencySpacing.sm),
            Row(
              children: <Widget>[
                Expanded(
                  child: FilledButton(
                    onPressed: () => _acceptProposal(proposal),
                    style:
                        FilledButton.styleFrom(minimumSize: const Size(44, 44)),
                    child: const Text('Accept'),
                  ),
                ),
                const SizedBox(width: AgencySpacing.sm),
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => _rejectProposal(proposal),
                    style: OutlinedButton.styleFrom(
                        minimumSize: const Size(44, 44)),
                    child: const Text('Reject'),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  String _proposalTitle(DraftProposal proposal) {
    if (proposal.kind == 'update_quantity') {
      return 'Change quantity to ${proposal.payload['quantity']}';
    }
    if (proposal.kind == 'add_line') {
      final line = proposal.payload['line'];
      if (line is Map) {
        return 'Add ${line['quantity']} × ${line['product_id']}';
      }
      return 'Add a catalogue line';
    }
    if (proposal.kind == 'remove_line') return 'Remove a line';
    if (proposal.kind == 'update_instruction') {
      return 'Update the material instruction';
    }
    return proposal.kind.replaceAll('_', ' ');
  }

  Widget _approvalCard(AgencyColors colors, WorkspaceDraftView view) {
    final draft = view.draft;
    final approval = view.approval;
    final revision = view.revision;
    final canRequest = !draft.isHouseholdRole &&
        draft.canEdit &&
        revision != null &&
        (approval == null || !approval.isPending) &&
        !_draftBusy;
    final canDecide = draft.canApprove &&
        approval != null &&
        approval.isPending &&
        !_draftBusy;
    return Container(
      padding: const EdgeInsets.all(AgencySpacing.md),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(AgencyRadius.md),
        border: Border.all(
          color: approval?.isPending == true
              ? colors.feedbackWarning
              : colors.borderDefault,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              Icon(Icons.verified_outlined,
                  size: 18, color: colors.actionPrimary),
              const SizedBox(width: AgencySpacing.xs),
              Expanded(
                child: Text(
                  'Approval',
                  style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: colors.contentPrimary),
                ),
              ),
              if (approval != null)
                _pill(colors, _label(approval.decision),
                    _statusColor(colors, approval.decision)),
            ],
          ),
          const SizedBox(height: AgencySpacing.xs),
          if (approval == null)
            Text(
              draft.canApprove
                  ? 'No revision is waiting for your decision.'
                  : 'No approval has been requested for this draft.',
              style: TextStyle(fontSize: 11, color: colors.contentSecondary),
            )
          else ...<Widget>[
            Text(
              'Requested by ${approval.requestedBy} for revision '
              '${revision?.version ?? '-'} (${_shortHash(approval.commercialHash)}).',
              style: TextStyle(
                  fontSize: 11, height: 1.35, color: colors.contentSecondary),
            ),
            if (approval.comment != null &&
                approval.comment!.isNotEmpty) ...<Widget>[
              const SizedBox(height: AgencySpacing.xs),
              Text(
                '“${approval.comment}”',
                style: TextStyle(fontSize: 11, color: colors.contentPrimary),
              ),
            ],
            if (approval.decisionComment != null &&
                approval.decisionComment!.isNotEmpty) ...<Widget>[
              const SizedBox(height: AgencySpacing.xs),
              Text(
                'Decision note: “${approval.decisionComment}”',
                style: TextStyle(fontSize: 11, color: colors.contentPrimary),
              ),
            ],
          ],
          if (canRequest) ...<Widget>[
            const SizedBox(height: AgencySpacing.sm),
            FilledButton.icon(
              onPressed: _requestApproval,
              style: FilledButton.styleFrom(minimumSize: const Size(44, 44)),
              icon: const Icon(Icons.send_outlined, size: 17),
              label: const Text('Request approval for this revision'),
            ),
          ],
          if (draft.canEdit && approval?.isPending == true)
            Padding(
              padding: const EdgeInsets.only(top: AgencySpacing.xs),
              child: Text(
                'Waiting for an approver. Any edit supersedes this request.',
                style: TextStyle(fontSize: 10, color: colors.contentSecondary),
              ),
            ),
          if (canDecide) ...<Widget>[
            const SizedBox(height: AgencySpacing.sm),
            Wrap(
              spacing: AgencySpacing.xs,
              runSpacing: AgencySpacing.xs,
              children: <Widget>[
                FilledButton(
                  onPressed: () => _decideApproval('approve'),
                  style:
                      FilledButton.styleFrom(minimumSize: const Size(44, 44)),
                  child: const Text('Approve'),
                ),
                OutlinedButton(
                  onPressed: () => _decideApproval('request-changes'),
                  style:
                      OutlinedButton.styleFrom(minimumSize: const Size(44, 44)),
                  child: const Text('Request changes'),
                ),
                TextButton(
                  onPressed: () => _decideApproval('reject'),
                  style: TextButton.styleFrom(minimumSize: const Size(44, 44)),
                  child: const Text('Reject'),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Widget _inlineError(AgencyColors colors, String message) => Container(
        width: double.infinity,
        padding: const EdgeInsets.all(AgencySpacing.sm),
        decoration: BoxDecoration(
          color: colors.feedbackError.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(AgencyRadius.sm),
        ),
        child: Text(
          message,
          style: TextStyle(fontSize: 11, color: colors.feedbackError),
        ),
      );

  Widget _pill(AgencyColors colors, String label, Color color) => Container(
        padding: const EdgeInsets.symmetric(
            horizontal: AgencySpacing.sm, vertical: 3),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(AgencyRadius.sm),
        ),
        child: Text(
          label,
          style:
              TextStyle(fontSize: 9, fontWeight: FontWeight.w700, color: color),
        ),
      );

  Color _statusColor(AgencyColors colors, String status) {
    switch (status) {
      case 'approved':
      case 'accepted':
      case 'edited_accepted':
        return colors.feedbackSuccess;
      case 'review_requested':
      case 'pending':
        return colors.feedbackWarning;
      case 'changes_requested':
      case 'rejected':
      case 'stale':
        return colors.feedbackError;
      default:
        return colors.contentSecondary;
    }
  }

  String _label(String value) => value
      .split('_')
      .map((part) =>
          part.isEmpty ? part : '${part[0].toUpperCase()}${part.substring(1)}')
      .join(' ');

  String _shortHash(String hash) =>
      hash.length <= 10 ? hash : '${hash.substring(0, 10)}…';

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

  Widget _eventStrip(AgencyColors colors, WorkspaceMessage message) {
    final reference = message.productReference;
    if (message.messageType == 'product_share' && reference != null) {
      final price = reference.unitAmountMinor > 0
          ? Money(
                  amount: reference.unitAmountMinor,
                  currencyCode:
                      reference.snapshot['currency_code'] as String? ?? 'INR')
              .formatted
          : null;
      return Container(
        width: double.infinity,
        margin: const EdgeInsets.symmetric(vertical: AgencySpacing.xs),
        padding: const EdgeInsets.all(AgencySpacing.sm),
        decoration: BoxDecoration(
          color: colors.surfaceRaised,
          borderRadius: BorderRadius.circular(AgencyRadius.md),
          border: Border.all(color: colors.borderDefault),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Icon(Icons.inventory_2_outlined,
                    size: 18, color: colors.actionPrimary),
                const SizedBox(width: AgencySpacing.sm),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Text(reference.title,
                          style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: colors.contentPrimary)),
                      Text(
                        'Shared by ${message.actorName} · Qty ${reference.quantity}'
                        '${price == null ? '' : ' · $price each'}'
                        '${reference.sellerName.isEmpty ? '' : ' · ${reference.sellerName}'}',
                        style: TextStyle(
                            fontSize: 10, color: colors.contentSecondary),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                onPressed: () => setState(() => _surface = 1),
                style: TextButton.styleFrom(minimumSize: const Size(44, 44)),
                child: const Text('Open purchase draft'),
              ),
            ),
          ],
        ),
      );
    }
    return Container(
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
                style: TextStyle(fontSize: 11, color: colors.contentSecondary)),
          ),
        ],
      ),
    );
  }

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
