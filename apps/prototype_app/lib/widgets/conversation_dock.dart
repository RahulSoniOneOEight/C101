import 'dart:async';

import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../data/experience_api.dart';
import '../domain/conversation_models.dart';
import '../domain/models.dart' show Money, Product;
import '../domain/workspace_models.dart';
import '../providers/b2b_trade_providers.dart';
import '../providers/catalog_providers.dart';
import '../providers/conversation_dock_provider.dart';
import '../providers/workspace_providers.dart';
import 'cart_build_sheet.dart';

enum _HouseholdProjectAction { create, join }

/// Shell-level slide-over. The routed page remains mounted underneath, so its
/// scroll controller, search query, selected filters and navigation state are
/// not replaced when conversation opens.
class ConversationDockHost extends ConsumerWidget {
  const ConversationDockHost({
    required this.child,
    required this.audience,
    required this.enabled,
    super.key,
  });

  final Widget child;
  final ConversationAudience audience;
  final bool enabled;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(conversationDockProvider);
    final open = enabled && state.isOpen && state.audience == audience;
    return LayoutBuilder(
      builder: (context, constraints) {
        final panelWidth = constraints.maxWidth <= 600
            ? constraints.maxWidth
            : constraints.maxWidth.clamp(360.0, 420.0);
        return Stack(
          clipBehavior: Clip.none,
          children: <Widget>[
            Positioned.fill(child: child),
            if (open)
              Positioned.fill(
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: () {
                    ScaffoldMessenger.maybeOf(context)?.hideCurrentSnackBar();
                    ref.read(conversationDockProvider.notifier).close();
                  },
                  child:
                      ColoredBox(color: Colors.black.withValues(alpha: 0.22)),
                ),
              ),
            AnimatedPositioned(
              duration: const Duration(milliseconds: 240),
              curve: Curves.easeOutCubic,
              top: 0,
              bottom: 0,
              right: open ? 0 : -panelWidth - 8,
              width: panelWidth,
              child: ConversationDockPanel(
                audience: audience,
                active: open,
                captureRequest: state.captureRequest,
                pendingCapture: state.pendingCapture,
              ),
            ),
          ],
        );
      },
    );
  }
}

class ConversationDockPanel extends ConsumerStatefulWidget {
  const ConversationDockPanel({
    required this.audience,
    required this.active,
    required this.captureRequest,
    required this.pendingCapture,
    super.key,
  });

  final ConversationAudience audience;
  final bool active;
  final int captureRequest;
  final ConversationProductCapture? pendingCapture;

  @override
  ConsumerState<ConversationDockPanel> createState() =>
      _ConversationDockPanelState();
}

class _ConversationDockPanelState extends ConsumerState<ConversationDockPanel> {
  final TextEditingController _composer = TextEditingController();
  final TextEditingController _projectName = TextEditingController();
  final TextEditingController _inviteEmail = TextEditingController();
  final TextEditingController _inviteToken = TextEditingController();
  final ScrollController _messagesScroll = ScrollController();

  List<WorkspaceSummary> _workspaces = const <WorkspaceSummary>[];
  List<WorkspaceMessage> _messages = const <WorkspaceMessage>[];
  WorkspaceSummary? _workspace;
  WorkspaceChannel? _channel;
  WorkspaceChannel? _assistantChannel;
  WorkspaceDraftView? _draftView;
  WorkspaceInvitationPage? _invitationPage;
  WorkspaceInvitationCreated? _createdInvitation;
  String? _cursor;
  String? _error;
  String? _actionError;
  bool _loading = false;
  bool _sending = false;
  bool _busy = false;
  int _handledCaptureRequest = 0;
  Timer? _poll;

  bool get _isHousehold => widget.audience == ConversationAudience.household;

  WorkspaceChannel? get _activeChannel =>
      ref.read(conversationDockProvider).tab == ConversationDockTab.assistant
          ? _assistantChannel
          : _channel;

  @override
  void initState() {
    super.initState();
    if (widget.active) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _load());
    }
  }

  @override
  void didUpdateWidget(covariant ConversationDockPanel oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.active && !oldWidget.active) {
      _load();
    } else if (!widget.active && oldWidget.active) {
      _poll?.cancel();
    }
    if (widget.active &&
        widget.captureRequest != oldWidget.captureRequest &&
        widget.pendingCapture != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _processCapture());
    }
  }

  @override
  void dispose() {
    _poll?.cancel();
    _composer.dispose();
    _projectName.dispose();
    _inviteEmail.dispose();
    _inviteToken.dispose();
    _messagesScroll.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    if (_loading || !widget.active) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final all = await ref.read(experienceApiProvider).getWorkspaces();
      final workspaces = all
          .where((item) =>
              _isHousehold ? item.isHousehold : item.isBusinessAccount)
          .toList();
      if (!mounted) return;
      final preferred =
          ref.read(conversationDockProvider).workspaceIdFor(widget.audience);
      final selected =
          workspaces.where((item) => item.id == preferred).firstOrNull ??
              workspaces.firstOrNull;
      setState(() {
        _workspaces = workspaces;
        _workspace = selected;
        _loading = false;
      });
      if (selected == null) {
        _poll?.cancel();
        return;
      }
      ref
          .read(conversationDockProvider.notifier)
          .selectWorkspace(widget.audience, selected.id);
      await _loadWorkspace(selected);
      _startPolling();
      await _processCapture();
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = _friendlyError(error);
      });
    }
  }

  Future<void> _loadWorkspace(WorkspaceSummary workspace) async {
    final api = ref.read(experienceApiProvider);
    final channels = await api.getWorkspaceChannels(workspace.id);
    final expectedKind = _isHousehold ? 'project' : 'procurement';
    final channel =
        channels.where((item) => item.kind == expectedKind).firstOrNull ??
            channels.firstOrNull;
    final assistant =
        channels.where((item) => item.kind == 'assistant').firstOrNull;
    final drafts = await api.getWorkspaceDrafts(workspace.id);
    final draft =
        drafts.isEmpty ? null : await api.getWorkspaceDraft(drafts.first.id);
    final messages = channel == null
        ? const WorkspaceMessagePage(
            messages: <WorkspaceMessage>[], nextCursor: '0')
        : await api.getWorkspaceMessages(channel.id);
    WorkspaceInvitationPage? invitations;
    if (workspace.canManageInvitations) {
      invitations = await api.getWorkspaceInvitations(workspace.id);
    }
    if (!mounted || _workspace?.id != workspace.id) return;
    setState(() {
      _channel = channel;
      _assistantChannel = assistant;
      _messages = messages.messages;
      _cursor = messages.nextCursor;
      _draftView = draft;
      _invitationPage = invitations;
      _actionError = null;
    });
    _markRead(messages.messages);
    _scrollToBottom();
  }

  Future<void> _selectTab(ConversationDockTab tab) async {
    if (tab == ref.read(conversationDockProvider).tab) return;
    ref.read(conversationDockProvider.notifier).selectTab(tab);
    if (tab == ConversationDockTab.sharedList || !widget.active) return;
    final channel =
        tab == ConversationDockTab.assistant ? _assistantChannel : _channel;
    if (channel == null) {
      setState(() => _actionError = 'The assistant channel is not available.');
      return;
    }
    setState(() {
      _messages = const <WorkspaceMessage>[];
      _cursor = null;
    });
    try {
      final page = await ref
          .read(experienceApiProvider)
          .getWorkspaceMessages(channel.id);
      if (!mounted) return;
      setState(() {
        _messages = page.messages;
        _cursor = page.nextCursor;
      });
      await _markRead(page.messages, channel);
      _scrollToBottom();
    } catch (error) {
      if (mounted) setState(() => _actionError = _friendlyError(error));
    }
  }

  Future<void> _selectWorkspace(WorkspaceSummary workspace) async {
    if (_busy || workspace.id == _workspace?.id) return;
    setState(() {
      _workspace = workspace;
      _channel = null;
      _assistantChannel = null;
      _messages = const <WorkspaceMessage>[];
      _draftView = null;
      _invitationPage = null;
      _createdInvitation = null;
    });
    ref.read(conversationDockProvider.notifier)
      ..selectWorkspace(widget.audience, workspace.id)
      ..selectTab(ConversationDockTab.chat);
    try {
      await _loadWorkspace(workspace);
      await _processCapture();
    } catch (error) {
      if (mounted) setState(() => _actionError = _friendlyError(error));
    }
  }

  void _startPolling() {
    _poll?.cancel();
    _poll = Timer.periodic(const Duration(seconds: 6), (_) => _pollMessages());
  }

  Future<void> _pollMessages() async {
    final channel = _activeChannel;
    if (!widget.active || channel == null || _sending || _busy) return;
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
      await _markRead(fresh);
      _scrollToBottom();
    } catch (_) {
      // Polling is best effort; explicit actions surface their own error.
    }
  }

  Future<void> _markRead(
    List<WorkspaceMessage> messages, [
    WorkspaceChannel? source,
  ]) async {
    final channel = source ?? _activeChannel;
    if (channel == null || messages.isEmpty) return;
    final sequence = messages.last.sequence;
    if (sequence <= 0) return;
    try {
      await ref
          .read(experienceApiProvider)
          .markWorkspaceRead(channel.id, sequence);
      ref.invalidate(workspaceUnreadCountProvider);
    } catch (_) {
      // Read state must never block chat.
    }
  }

  void _sendQuickPrompt(String prompt) {
    if (_sending) return;
    _composer.text = prompt;
    unawaited(_send());
  }

  Future<void> _send() async {
    final channel = _activeChannel;
    final text = _composer.text.trim();
    if (channel == null || text.isEmpty || _sending) return;
    setState(() {
      _sending = true;
      _actionError = null;
    });
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
      await _markRead(<WorkspaceMessage>[sent]);
      _scrollToBottom();
    } catch (error) {
      if (mounted) setState(() => _actionError = _friendlyError(error));
    } finally {
      if (mounted) {
        setState(() => _sending = false);
        unawaited(_pollMessages());
      }
    }
  }

  Future<void> _processCapture() async {
    final request = widget.captureRequest;
    final capture = widget.pendingCapture;
    final workspace = _workspace;
    final channel = _channel;
    if (!widget.active ||
        capture == null ||
        request == _handledCaptureRequest ||
        _busy ||
        workspace == null ||
        channel == null) {
      return;
    }
    if (!capture.isShareable) {
      setState(() => _actionError =
          'This product has no active offer, so it cannot be discussed yet.');
      _handledCaptureRequest = request;
      ref.read(conversationDockProvider.notifier).clearCapture(request);
      return;
    }
    setState(() {
      _busy = true;
      _actionError = null;
    });
    try {
      final api = ref.read(experienceApiProvider);
      await api.shareProductToWorkspace(
        channelId: channel.id,
        productId: capture.productId,
        variantId: capture.variantId,
        offerId: capture.offerId,
        quantity: capture.quantity,
        sellerId: capture.sellerId,
        productTitle: capture.title,
        materialInstruction: capture.materialInstruction,
        commercialSnapshot: capture.commercialSnapshot,
      );
      await _ensureSharedListLine(capture);
      final page = await api.getWorkspaceMessages(channel.id);
      final drafts = await api.getWorkspaceDrafts(workspace.id);
      final draft =
          drafts.isEmpty ? null : await api.getWorkspaceDraft(drafts.first.id);
      if (!mounted) return;
      setState(() {
        _messages = page.messages;
        _cursor = page.nextCursor;
        _draftView = draft;
      });
      _handledCaptureRequest = request;
      ref.read(conversationDockProvider.notifier).clearCapture(request);
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(
          content:
              Text('${capture.title} added to the conversation—not the cart.'),
          action: SnackBarAction(
            label: 'Shared list',
            onPressed: () => ref
                .read(conversationDockProvider.notifier)
                .selectTab(ConversationDockTab.sharedList),
          ),
        ));
      _scrollToBottom();
    } catch (error) {
      if (mounted) setState(() => _actionError = _friendlyError(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _ensureSharedListLine(
    ConversationProductCapture capture,
  ) async {
    final workspace = _workspace;
    final channel = _channel;
    if (workspace == null || channel == null) return;
    // Approvers may discuss and share product references, but procurement
    // rules do not let them create or change purchase intent.
    if (!workspace.canContributeToSharedList) return;
    final api = ref.read(experienceApiProvider);
    var view = _draftView;
    view ??= await api.createWorkspaceDraft(
      workspaceId: workspace.id,
      channelId: channel.id,
      name: _isHousehold ? '${workspace.name} shared list' : 'Procurement list',
      // A participant initializes only the aggregate. Their product remains
      // a proposal until the household owner accepts it.
      lines: workspace.role == 'member'
          ? const <Map<String, dynamic>>[]
          : <Map<String, dynamic>>[capture.draftLine],
    );
    final alreadyAccepted = view.revision?.lines
            .any((line) => line.variantId == capture.variantId) ??
        false;
    final alreadyProposed = view.proposals.any((proposal) {
      if (!proposal.isPending || proposal.kind != 'add_line') return false;
      final line = proposal.payload['line'];
      return line is Map && line['variant_id'] == capture.variantId;
    });
    if (alreadyAccepted || alreadyProposed) return;
    final proposalId = await api.createDraftProposal(
      draftId: view.draft.id,
      expectedVersion: view.revision?.version ?? view.draft.currentVersion,
      kind: 'add_line',
      payload: <String, dynamic>{'line': capture.draftLine},
    );
    if (view.draft.canDecideProposal && proposalId.isNotEmpty) {
      await api.acceptProposal(proposalId);
    }
  }

  Future<void> _proposeQuantity(DraftLine line, int delta) async {
    final view = _draftView;
    final revision = view?.revision;
    final next = line.quantity + delta;
    if (view == null || revision == null || next < 1 || _busy) return;
    await _runAction(() async {
      final api = ref.read(experienceApiProvider);
      final proposalId = await api.createDraftProposal(
        draftId: view.draft.id,
        expectedVersion: revision.version,
        kind: 'update_quantity',
        payload: <String, dynamic>{
          'line_key': line.lineKey,
          'quantity': next,
        },
      );
      if (view.draft.canDecideProposal && proposalId.isNotEmpty) {
        await api.acceptProposal(proposalId);
      }
    });
  }

  Future<void> _decideProposal(DraftProposal proposal, bool accept) =>
      _runAction(() => accept
          ? ref.read(experienceApiProvider).acceptProposal(proposal.id)
          : ref.read(experienceApiProvider).rejectProposal(proposal.id));

  Future<void> _runAction(Future<void> Function() action) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _actionError = null;
    });
    try {
      await action();
      final workspace = _workspace;
      if (workspace != null) {
        final drafts = await ref
            .read(experienceApiProvider)
            .getWorkspaceDrafts(workspace.id);
        final view = drafts.isEmpty
            ? null
            : await ref
                .read(experienceApiProvider)
                .getWorkspaceDraft(drafts.first.id);
        if (mounted) setState(() => _draftView = view);
      }
    } catch (error) {
      if (mounted) setState(() => _actionError = _friendlyError(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _createProject() async {
    final name = _projectName.text.trim();
    if (name.isEmpty || _busy) return;
    setState(() {
      _busy = true;
      _actionError = null;
    });
    try {
      final created =
          await ref.read(experienceApiProvider).createHouseholdProject(name);
      _projectName.clear();
      ref
          .read(conversationDockProvider.notifier)
          .selectWorkspace(widget.audience, created.id);
      if (mounted) setState(() => _busy = false);
      await _load();
      await _processCapture();
    } catch (error) {
      if (mounted) {
        setState(() {
          _busy = false;
          _actionError = _friendlyError(error);
        });
      }
    }
  }

  Future<void> _acceptInvitation() async {
    final token = _inviteToken.text.trim();
    if (token.isEmpty || _busy) return;
    setState(() {
      _busy = true;
      _actionError = null;
    });
    try {
      final joined = await ref
          .read(experienceApiProvider)
          .acceptWorkspaceInvitation(token);
      _inviteToken.clear();
      ref
          .read(conversationDockProvider.notifier)
          .selectWorkspace(widget.audience, joined.id);
      if (mounted) setState(() => _busy = false);
      await _load();
      await _processCapture();
    } catch (error) {
      if (mounted) {
        setState(() {
          _busy = false;
          _actionError = _friendlyError(error);
        });
      }
    }
  }

  Future<void> _invite() async {
    final workspace = _workspace;
    final email = _inviteEmail.text.trim();
    if (workspace == null || email.isEmpty || _busy) return;
    setState(() {
      _busy = true;
      _actionError = null;
    });
    try {
      final created = await ref
          .read(experienceApiProvider)
          .inviteWorkspaceParticipant(workspaceId: workspace.id, email: email);
      final page = await ref
          .read(experienceApiProvider)
          .getWorkspaceInvitations(workspace.id);
      if (!mounted) return;
      _inviteEmail.clear();
      setState(() {
        _createdInvitation = created;
        _invitationPage = page;
      });
    } catch (error) {
      if (mounted) setState(() => _actionError = _friendlyError(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _revoke(WorkspaceInvitation invitation) async {
    final workspace = _workspace;
    if (workspace == null || _busy) return;
    await _runAction(() async {
      final api = ref.read(experienceApiProvider);
      await api.revokeWorkspaceInvitation(
        workspaceId: workspace.id,
        invitationId: invitation.id,
      );
      final page = await api.getWorkspaceInvitations(workspace.id);
      if (mounted) setState(() => _invitationPage = page);
    });
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_messagesScroll.hasClients) return;
      _messagesScroll.animateTo(
        _messagesScroll.position.maxScrollExtent,
        duration: const Duration(milliseconds: 180),
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
      if (error.response?.statusCode == 404) {
        return 'This conversation is not available to your account.';
      }
      if (error.response?.statusCode == 403) {
        return 'Your project role does not allow this action.';
      }
    }
    return 'Could not update the conversation. Please retry.';
  }

  @override
  Widget build(BuildContext context) {
    final colors =
        Theme.of(context).extension<AgencyColors>() ?? AgencyColors.light;
    final dock = ref.watch(conversationDockProvider);
    return Material(
      elevation: 18,
      color: colors.surfacePage,
      child: SafeArea(
        child: Column(
          children: <Widget>[
            _header(colors),
            if (_actionError != null) _errorStrip(colors, _actionError!),
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : _error != null
                      ? _loadError(colors)
                      : _workspace == null
                          ? _emptyWorkspace(colors)
                          : dock.tab == ConversationDockTab.sharedList
                              ? _sharedList(colors)
                              : _chat(colors),
            ),
            if (_workspace != null &&
                (dock.tab == ConversationDockTab.chat ||
                    dock.tab == ConversationDockTab.assistant))
              _composerBar(colors),
          ],
        ),
      ),
    );
  }

  Widget _header(AgencyColors colors) {
    final dock = ref.watch(conversationDockProvider);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        border: Border(bottom: BorderSide(color: colors.borderDefault)),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(
          AgencySpacing.md,
          AgencySpacing.sm,
          AgencySpacing.xs,
          AgencySpacing.sm,
        ),
        child: Column(
          children: <Widget>[
            Row(
              children: <Widget>[
                Icon(
                  dock.tab == ConversationDockTab.assistant
                      ? Icons.smart_toy_outlined
                      : Icons.forum_outlined,
                  color: colors.actionPrimary,
                ),
                const SizedBox(width: AgencySpacing.sm),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Text(
                        dock.tab == ConversationDockTab.assistant
                            ? 'BuildKart Cart Assistant'
                            : _isHousehold
                                ? 'Project conversation'
                                : 'Procurement conversation',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                          color: colors.contentPrimary,
                        ),
                      ),
                      Text(
                        dock.tab == ConversationDockTab.assistant
                            ? 'Automated · read-only · human escalation available'
                            : 'Staging · Discussion never changes your cart',
                        style: TextStyle(
                            fontSize: 10, color: colors.contentSecondary),
                      ),
                    ],
                  ),
                ),
                if (!_isHousehold)
                  IconButton(
                    tooltip: 'Open full workspace',
                    onPressed: () {
                      ScaffoldMessenger.maybeOf(context)?.hideCurrentSnackBar();
                      ref.read(conversationDockProvider.notifier).close();
                      context.push('/b2b/workspace');
                    },
                    icon: const Icon(Icons.open_in_full, size: 19),
                  ),
                if (_isHousehold && _workspace != null)
                  PopupMenuButton<_HouseholdProjectAction>(
                    tooltip: 'Project actions',
                    icon: const Icon(Icons.more_vert),
                    onSelected: (action) {
                      switch (action) {
                        case _HouseholdProjectAction.create:
                          _showCreateProjectSheet(colors);
                        case _HouseholdProjectAction.join:
                          _showJoinProjectSheet(colors);
                      }
                    },
                    itemBuilder: (context) =>
                        const <PopupMenuEntry<_HouseholdProjectAction>>[
                      PopupMenuItem<_HouseholdProjectAction>(
                        value: _HouseholdProjectAction.create,
                        child: Text('New project'),
                      ),
                      PopupMenuItem<_HouseholdProjectAction>(
                        value: _HouseholdProjectAction.join,
                        child: Text('Join with code'),
                      ),
                    ],
                  ),
                IconButton(
                  tooltip: 'Close conversations',
                  onPressed: () {
                    ScaffoldMessenger.maybeOf(context)?.hideCurrentSnackBar();
                    ref.read(conversationDockProvider.notifier).close();
                  },
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
            if (_workspace != null) ...<Widget>[
              const SizedBox(height: AgencySpacing.xs),
              Row(
                children: <Widget>[
                  Expanded(child: _workspacePicker(colors)),
                  if (_workspace!.canManageInvitations)
                    IconButton(
                      tooltip: 'Manage participants',
                      onPressed: () => _showParticipants(colors),
                      icon: const Icon(Icons.group_outlined),
                    ),
                ],
              ),
              const SizedBox(height: AgencySpacing.xs),
              SizedBox(
                width: double.infinity,
                child: SegmentedButton<ConversationDockTab>(
                  segments: <ButtonSegment<ConversationDockTab>>[
                    const ButtonSegment<ConversationDockTab>(
                      value: ConversationDockTab.chat,
                      icon: Icon(Icons.chat_bubble_outline, size: 16),
                      label: FittedBox(
                        fit: BoxFit.scaleDown,
                        child: Text('Chat'),
                      ),
                    ),
                    const ButtonSegment<ConversationDockTab>(
                      value: ConversationDockTab.sharedList,
                      icon: Icon(Icons.playlist_add_check, size: 17),
                      label: FittedBox(
                        fit: BoxFit.scaleDown,
                        child: Text('Shared list'),
                      ),
                    ),
                    if (_assistantChannel != null)
                      const ButtonSegment<ConversationDockTab>(
                        value: ConversationDockTab.assistant,
                        icon: Icon(Icons.smart_toy_outlined, size: 16),
                        label: FittedBox(
                          fit: BoxFit.scaleDown,
                          child: Text('Assistant'),
                        ),
                      ),
                  ],
                  selected: <ConversationDockTab>{dock.tab},
                  onSelectionChanged: (selection) =>
                      _selectTab(selection.first),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _workspacePicker(AgencyColors colors) {
    if (_workspaces.length <= 1) {
      return Row(
        children: <Widget>[
          Expanded(
            child: Text(
              _workspace!.name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: colors.contentPrimary,
              ),
            ),
          ),
          _pill(colors, _workspace!.role, colors.actionPrimary),
        ],
      );
    }
    return DropdownButtonHideUnderline(
      child: DropdownButton<String>(
        isExpanded: true,
        value: _workspace?.id,
        items: <DropdownMenuItem<String>>[
          for (final item in _workspaces)
            DropdownMenuItem<String>(
              value: item.id,
              child: Text(item.name, overflow: TextOverflow.ellipsis),
            ),
        ],
        onChanged: (id) {
          final selected =
              _workspaces.where((item) => item.id == id).firstOrNull;
          if (selected != null) _selectWorkspace(selected);
        },
      ),
    );
  }

  Widget _loadError(AgencyColors colors) => Center(
        child: Padding(
          padding: const EdgeInsets.all(AgencySpacing.lg),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              Icon(Icons.cloud_off_outlined,
                  size: 34, color: colors.contentSecondary),
              const SizedBox(height: AgencySpacing.sm),
              Text(_error!, textAlign: TextAlign.center),
              const SizedBox(height: AgencySpacing.md),
              FilledButton(onPressed: _load, child: const Text('Retry')),
            ],
          ),
        ),
      );

  Widget _emptyWorkspace(AgencyColors colors) {
    if (!_isHousehold) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(AgencySpacing.lg),
          child: Text(
            'No procurement workspace is available for this account.',
            textAlign: TextAlign.center,
            style: TextStyle(color: colors.contentSecondary),
          ),
        ),
      );
    }
    return ListView(
      padding: const EdgeInsets.all(AgencySpacing.md),
      children: <Widget>[
        Icon(Icons.home_work_outlined, size: 38, color: colors.actionPrimary),
        const SizedBox(height: AgencySpacing.sm),
        Text(
          'Start a renovation project',
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w700,
            color: colors.contentPrimary,
          ),
        ),
        const SizedBox(height: AgencySpacing.xs),
        Text(
          'Create one shared place for product discussions and quantities. '
          'Only you can manage invitations and checkout.',
          style: TextStyle(
              fontSize: 12, height: 1.4, color: colors.contentSecondary),
        ),
        const SizedBox(height: AgencySpacing.md),
        TextField(
          controller: _projectName,
          textInputAction: TextInputAction.done,
          onSubmitted: (_) => _createProject(),
          decoration: const InputDecoration(
            labelText: 'Project name',
            hintText: 'e.g. Kitchen renovation',
            prefixIcon: Icon(Icons.edit_outlined),
          ),
        ),
        const SizedBox(height: AgencySpacing.sm),
        FilledButton.icon(
          onPressed: _busy ? null : _createProject,
          icon: const Icon(Icons.add_home_work_outlined),
          label: const Text('Create project'),
          style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
        ),
        const Padding(
          padding: EdgeInsets.symmetric(vertical: AgencySpacing.lg),
          child: Divider(),
        ),
        Text(
          'Have an invitation?',
          style: TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w700,
            color: colors.contentPrimary,
          ),
        ),
        const SizedBox(height: AgencySpacing.sm),
        TextField(
          controller: _inviteToken,
          decoration: const InputDecoration(
            labelText: 'Invitation code',
            prefixIcon: Icon(Icons.key_outlined),
          ),
        ),
        const SizedBox(height: AgencySpacing.sm),
        OutlinedButton.icon(
          onPressed: _busy ? null : _acceptInvitation,
          icon: const Icon(Icons.login),
          label: const Text('Join project'),
          style:
              OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
        ),
      ],
    );
  }

  Widget _chat(AgencyColors colors) {
    final assistant = ref.watch(conversationDockProvider).tab ==
        ConversationDockTab.assistant;
    if (_messages.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(AgencySpacing.lg),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              Icon(
                assistant
                    ? Icons.smart_toy_outlined
                    : Icons.chat_bubble_outline,
                size: 36,
                color: colors.contentSecondary,
              ),
              const SizedBox(height: AgencySpacing.sm),
              Text(
                assistant
                    ? 'Ask me to summarise the shared list, explain cart build, or flag a blocked quantity.'
                    : _isHousehold
                        ? 'No messages yet. Discuss a product or say hello.'
                        : 'No messages yet. Start the procurement conversation.',
                textAlign: TextAlign.center,
                style: TextStyle(color: colors.contentSecondary),
              ),
              if (assistant) ...<Widget>[
                const SizedBox(height: AgencySpacing.md),
                Wrap(
                  spacing: AgencySpacing.xs,
                  runSpacing: AgencySpacing.xs,
                  alignment: WrapAlignment.center,
                  children: <Widget>[
                    ActionChip(
                      label: const Text('Summarise the list'),
                      onPressed: () =>
                          _sendQuickPrompt('Summarise the shared list'),
                    ),
                    ActionChip(
                      label: const Text('What is blocked?'),
                      onPressed: () =>
                          _sendQuickPrompt('What is missing or blocked?'),
                    ),
                    ActionChip(
                      label: const Text('How does cart build work?'),
                      onPressed: () =>
                          _sendQuickPrompt('How does the cart build work?'),
                    ),
                    ActionChip(
                      label: const Text('Ask a human'),
                      onPressed: () => _sendQuickPrompt(
                        'I need a human to review this list',
                      ),
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),
      );
    }
    final userId = ref.read(experienceApiProvider).sessionUserId;
    return ListView.builder(
      controller: _messagesScroll,
      padding: const EdgeInsets.all(AgencySpacing.md),
      itemCount: _messages.length,
      itemBuilder: (context, index) {
        final message = _messages[index];
        if (message.messageType == 'product_share' &&
            message.productReference != null) {
          return _productShare(colors, message);
        }
        return _messageBubble(colors, message, message.actorId == userId);
      },
    );
  }

  Widget _messageBubble(
      AgencyColors colors, WorkspaceMessage message, bool mine) {
    final isAssistant = message.actorId == 'assistant_cart';
    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        constraints: const BoxConstraints(maxWidth: 310),
        margin: const EdgeInsets.only(bottom: AgencySpacing.xs),
        padding: const EdgeInsets.symmetric(
            horizontal: AgencySpacing.md, vertical: AgencySpacing.sm),
        decoration: BoxDecoration(
          color: isAssistant
              ? colors.surfaceRaised
              : mine
                  ? colors.actionPrimary
                  : colors.surfaceInteractive,
          border: isAssistant
              ? Border.all(color: colors.actionPrimary.withValues(alpha: 0.35))
              : null,
          borderRadius: BorderRadius.circular(AgencyRadius.md),
        ),
        child: Column(
          crossAxisAlignment:
              mine ? CrossAxisAlignment.end : CrossAxisAlignment.start,
          children: <Widget>[
            if (!mine)
              Row(
                mainAxisSize: MainAxisSize.min,
                children: <Widget>[
                  if (isAssistant) ...<Widget>[
                    Icon(Icons.smart_toy_outlined,
                        size: 11, color: colors.actionPrimary),
                    const SizedBox(width: 3),
                  ],
                  Flexible(
                    child: Text(
                      isAssistant
                          ? 'Automated · ${message.actorName}'
                          : message.actorName,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                        color: colors.actionPrimary,
                      ),
                    ),
                  ),
                ],
              ),
            Text(
              message.body,
              style: TextStyle(
                fontSize: 13,
                height: 1.35,
                color: mine ? colors.contentInverse : colors.contentPrimary,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _productShare(AgencyColors colors, WorkspaceMessage message) {
    final reference = message.productReference!;
    final price = reference.unitAmountMinor <= 0
        ? null
        : Money(
            amount: reference.unitAmountMinor,
            currencyCode:
                reference.snapshot['currency_code'] as String? ?? 'INR',
          ).formatted;
    final thumbnail = reference.snapshot['thumbnail'] as String?;
    return Container(
      margin: const EdgeInsets.only(bottom: AgencySpacing.sm),
      padding: const EdgeInsets.all(AgencySpacing.sm),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(AgencyRadius.md),
        border: Border.all(color: colors.borderDefault),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Container(
            width: 52,
            height: 52,
            clipBehavior: Clip.antiAlias,
            decoration: BoxDecoration(
              color: colors.surfacePage,
              borderRadius: BorderRadius.circular(AgencyRadius.sm),
            ),
            child: thumbnail == null || thumbnail.isEmpty
                ? Icon(Icons.inventory_2_outlined,
                    color: colors.contentSecondary)
                : Image.network(
                    thumbnail,
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => Icon(
                        Icons.inventory_2_outlined,
                        color: colors.contentSecondary),
                  ),
          ),
          const SizedBox(width: AgencySpacing.sm),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  reference.title,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: colors.contentPrimary,
                  ),
                ),
                Text(
                  'Shared by ${message.actorName} · Qty ${reference.quantity}'
                  '${price == null ? '' : ' · $price'}',
                  style:
                      TextStyle(fontSize: 10, color: colors.contentSecondary),
                ),
                TextButton(
                  onPressed: () => ref
                      .read(conversationDockProvider.notifier)
                      .selectTab(ConversationDockTab.sharedList),
                  style: TextButton.styleFrom(
                    minimumSize: const Size(44, 44),
                    padding: EdgeInsets.zero,
                  ),
                  child: const Text('Open shared list'),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _sharedList(AgencyColors colors) {
    final view = _draftView;
    if (view == null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(AgencySpacing.lg),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              Icon(Icons.playlist_add,
                  size: 38, color: colors.contentSecondary),
              const SizedBox(height: AgencySpacing.sm),
              Text(
                'No shared products yet',
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                  color: colors.contentPrimary,
                ),
              ),
              const SizedBox(height: AgencySpacing.xs),
              Text(
                'Use Discuss on a product. It will appear here without changing your cart.',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 12, color: colors.contentSecondary),
              ),
            ],
          ),
        ),
      );
    }
    final revision = view.revision;
    final pending =
        view.proposals.where((proposal) => proposal.isPending).toList();
    return ListView(
      padding: const EdgeInsets.all(AgencySpacing.md),
      children: <Widget>[
        Row(
          children: <Widget>[
            Expanded(
              child: Text(
                view.draft.name,
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                  color: colors.contentPrimary,
                ),
              ),
            ),
            _pill(
              colors,
              revision == null ? 'Not accepted' : 'v${revision.version}',
              colors.contentSecondary,
            ),
          ],
        ),
        const SizedBox(height: AgencySpacing.xs),
        Text(
          revision == null
              ? 'Purchase intent only · awaiting the first owner decision'
              : 'Purchase intent only · ${view.draft.lifecycleStatus.replaceAll('_', ' ')}',
          style: TextStyle(fontSize: 10, color: colors.contentSecondary),
        ),
        const SizedBox(height: AgencySpacing.md),
        for (final line in revision?.lines ?? const <DraftLine>[]) ...<Widget>[
          _sharedLine(colors, view, line),
          const SizedBox(height: AgencySpacing.sm),
        ],
        if (pending.isNotEmpty) ...<Widget>[
          const SizedBox(height: AgencySpacing.sm),
          Text(
            'Pending proposals',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: colors.contentPrimary,
            ),
          ),
          const SizedBox(height: AgencySpacing.sm),
          for (final proposal in pending) _proposalCard(colors, view, proposal),
        ],
        if (revision == null && pending.isEmpty) ...<Widget>[
          const SizedBox(height: AgencySpacing.lg),
          Text(
            'Use Discuss on a product to start the shared list.',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 12, color: colors.contentSecondary),
          ),
        ],
        if (view.draft.canEdit) ...<Widget>[
          const SizedBox(height: AgencySpacing.sm),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: _busy ? null : () => _showProductPicker(),
              icon: const Icon(Icons.add_circle_outline, size: 18),
              label: const Text('Add product'),
            ),
          ),
        ],
        const SizedBox(height: AgencySpacing.md),
        _checkoutBoundary(colors, view),
      ],
    );
  }

  Widget _sharedLine(
      AgencyColors colors, WorkspaceDraftView view, DraftLine line) {
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
          Text(
            line.productTitle,
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: colors.contentPrimary,
            ),
          ),
          if (line.sellerName.isNotEmpty)
            Text(line.sellerName,
                style: TextStyle(fontSize: 10, color: colors.contentSecondary)),
          const SizedBox(height: AgencySpacing.xs),
          Row(
            children: <Widget>[
              Expanded(
                child: Text(
                  '${Money(amount: line.unitAmountMinor, currencyCode: line.currencyCode).formatted} each',
                  style:
                      TextStyle(fontSize: 11, color: colors.contentSecondary),
                ),
              ),
              if (view.draft.canEdit) ...<Widget>[
                IconButton.outlined(
                  tooltip: 'Decrease quantity',
                  onPressed: _busy || line.quantity <= 1
                      ? null
                      : () => _proposeQuantity(line, -1),
                  icon: const Icon(Icons.remove, size: 17),
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  child: Text(
                    '${line.quantity}',
                    style: TextStyle(
                      fontWeight: FontWeight.w700,
                      color: colors.contentPrimary,
                    ),
                  ),
                ),
                IconButton.outlined(
                  tooltip: 'Increase quantity',
                  onPressed: _busy ? null : () => _proposeQuantity(line, 1),
                  icon: const Icon(Icons.add, size: 17),
                ),
              ] else
                _pill(colors, 'Qty ${line.quantity}', colors.contentSecondary),
            ],
          ),
          if (view.draft.role == 'member')
            Text(
              'Your quantity change becomes a proposal for the owner.',
              style: TextStyle(fontSize: 9, color: colors.contentSecondary),
            ),
        ],
      ),
    );
  }

  Widget _proposalCard(
      AgencyColors colors, WorkspaceDraftView view, DraftProposal proposal) {
    final quantity = proposal.payload['quantity'];
    final line = proposal.payload['line'];
    final snapshot = line is Map ? line['commercial_snapshot'] : null;
    final productTitle =
        snapshot is Map ? snapshot['product_title']?.toString() : null;
    final title = proposal.kind == 'update_quantity'
        ? 'Change quantity to $quantity'
        : proposal.kind == 'add_line' && line is Map
            ? 'Add ${productTitle?.trim().isNotEmpty == true ? productTitle : line['product_id']}'
            : proposal.kind.replaceAll('_', ' ');
    return Container(
      margin: const EdgeInsets.only(bottom: AgencySpacing.sm),
      padding: const EdgeInsets.all(AgencySpacing.sm),
      decoration: BoxDecoration(
        color: colors.surfaceInteractive,
        borderRadius: BorderRadius.circular(AgencyRadius.md),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(title,
              style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: colors.contentPrimary)),
          Text(
            'Proposed by ${proposal.proposedBy} · based on v${proposal.expectedVersion}',
            style: TextStyle(fontSize: 10, color: colors.contentSecondary),
          ),
          if (view.draft.canDecideProposal) ...<Widget>[
            const SizedBox(height: AgencySpacing.xs),
            Row(
              children: <Widget>[
                Expanded(
                  child: FilledButton(
                    onPressed:
                        _busy ? null : () => _decideProposal(proposal, true),
                    child: const Text('Accept'),
                  ),
                ),
                const SizedBox(width: AgencySpacing.sm),
                Expanded(
                  child: OutlinedButton(
                    onPressed:
                        _busy ? null : () => _decideProposal(proposal, false),
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

  Widget _checkoutBoundary(AgencyColors colors, WorkspaceDraftView view) {
    final household = view.draft.isHouseholdRole;
    final hasAcceptedRevision = view.revision != null;
    final canSeeEntry = view.draft.isOwner ||
        view.draft.role == 'buyer' ||
        view.draft.role == 'admin';
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
          Row(
            children: <Widget>[
              Icon(Icons.lock_outline, size: 18, color: colors.actionPrimary),
              const SizedBox(width: AgencySpacing.xs),
              Expanded(
                child: Text(
                  household ? 'Owner-only checkout' : 'Controlled cart build',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: colors.contentPrimary,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: AgencySpacing.xs),
          Text(
            canSeeEntry
                ? 'Review the accepted revision. Current price, stock, MOQ and seller are checked before anything is added to the cart.'
                : household
                    ? 'Only the project owner can see delivery, payment and checkout details.'
                    : 'Approvers can review revisions but cannot build a cart.',
            style: TextStyle(
                fontSize: 10, height: 1.35, color: colors.contentSecondary),
          ),
          if (canSeeEntry && hasAcceptedRevision) ...<Widget>[
            const SizedBox(height: AgencySpacing.sm),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: () => showCartBuildSheet(
                  context,
                  view: view,
                  business: widget.audience == ConversationAudience.business,
                  onViewCart: () {
                    final business =
                        widget.audience == ConversationAudience.business;
                    ref.read(conversationDockProvider.notifier).close();
                    if (mounted) {
                      context.go(business ? '/b2b/cart' : '/cart');
                    }
                  },
                ),
                icon: const Icon(Icons.shopping_cart_checkout, size: 18),
                label: const Text('Review before cart build'),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _composerBar(AgencyColors colors) {
    final assistant = ref.watch(conversationDockProvider).tab ==
        ConversationDockTab.assistant;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        border: Border(top: BorderSide(color: colors.borderDefault)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(AgencySpacing.sm),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: <Widget>[
            if (!assistant)
              IconButton(
                tooltip: 'Add product',
                onPressed: _busy ? null : () => _showProductPicker(),
                icon: const Icon(Icons.add_circle_outline, size: 21),
              ),
            if (!assistant && _assistantChannel != null)
              IconButton(
                tooltip: 'Mention cart assistant',
                onPressed: () {
                  _composer.text = '@assistant ';
                  _composer.selection = const TextSelection.collapsed(
                    offset: 11,
                  );
                },
                icon: const Icon(Icons.smart_toy_outlined, size: 20),
              ),
            const SizedBox(width: AgencySpacing.xs),
            Expanded(
              child: TextField(
                controller: _composer,
                minLines: 1,
                maxLines: 3,
                textInputAction: TextInputAction.send,
                onSubmitted: (_) => _send(),
                decoration: InputDecoration(
                  hintText: assistant
                      ? 'Ask the read-only cart assistant'
                      : 'Write a message',
                  isDense: true,
                ),
              ),
            ),
            const SizedBox(width: AgencySpacing.xs),
            IconButton.filled(
              tooltip: 'Send message',
              onPressed: _sending ? null : _send,
              icon: _sending
                  ? const SizedBox(
                      width: 17,
                      height: 17,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.send, size: 19),
            ),
          ],
        ),
      ),
    );
  }

  Widget _errorStrip(AgencyColors colors, String message) => Container(
        width: double.infinity,
        color: colors.feedbackError.withValues(alpha: 0.08),
        padding: const EdgeInsets.symmetric(
            horizontal: AgencySpacing.md, vertical: AgencySpacing.sm),
        child: Row(
          children: <Widget>[
            Icon(Icons.error_outline, size: 17, color: colors.feedbackError),
            const SizedBox(width: AgencySpacing.xs),
            Expanded(
              child: Text(message,
                  style: TextStyle(fontSize: 11, color: colors.feedbackError)),
            ),
            IconButton(
              tooltip: 'Dismiss error',
              onPressed: () => setState(() => _actionError = null),
              icon: const Icon(Icons.close, size: 17),
            ),
          ],
        ),
      );

  Widget _pill(AgencyColors colors, String label, Color color) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(999),
        ),
        child: Text(
          label,
          style:
              TextStyle(fontSize: 9, fontWeight: FontWeight.w700, color: color),
        ),
      );

  List<Product> _pickerProducts() {
    if (_isHousehold) {
      return ref.read(productsProvider).value ?? const <Product>[];
    }
    return ref
        .read(tradeCatalogueViewProvider)
        .map((item) => item.product)
        .toList();
  }

  Future<void> _showProductPicker() async {
    if (_isHousehold) {
      // The dock may be opened before the storefront has subscribed to the
      // catalogue. Resolve the existing provider instead of showing an empty
      // picker.
      try {
        await ref.read(productsProvider.future);
      } catch (_) {
        // The picker shows its explicit loading/empty state below.
      }
      if (!mounted) return;
    }
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (_) => _ProductPickerSheet(
        audience: widget.audience,
        products: _pickerProducts(),
      ),
    );
  }

  Future<void> _showCreateProjectSheet(AgencyColors colors) async {
    _projectName.clear();
    setState(() => _actionError = null);
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (sheetContext) => StatefulBuilder(
        builder: (sheetContext, setSheet) => SafeArea(
          child: Padding(
            padding: EdgeInsets.fromLTRB(
              AgencySpacing.md,
              0,
              AgencySpacing.md,
              MediaQuery.viewInsetsOf(sheetContext).bottom + AgencySpacing.md,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: <Widget>[
                Text(
                  'New household project',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                    color: colors.contentPrimary,
                  ),
                ),
                const SizedBox(height: AgencySpacing.xs),
                Text(
                  'Each project has one shared list and up to three participants.',
                  style:
                      TextStyle(fontSize: 11, color: colors.contentSecondary),
                ),
                const SizedBox(height: AgencySpacing.md),
                TextField(
                  controller: _projectName,
                  autofocus: true,
                  textInputAction: TextInputAction.done,
                  onSubmitted: (_) => _createProject(),
                  decoration: const InputDecoration(
                    labelText: 'Project name',
                    hintText: 'e.g. Kitchen renovation',
                    prefixIcon: Icon(Icons.edit_outlined),
                  ),
                ),
                const SizedBox(height: AgencySpacing.sm),
                FilledButton.icon(
                  onPressed: _busy
                      ? null
                      : () async {
                          await _createProject();
                          if (_actionError == null && sheetContext.mounted) {
                            Navigator.pop(sheetContext);
                          } else {
                            setSheet(() {});
                          }
                        },
                  icon: const Icon(Icons.add_home_work_outlined),
                  label: const Text('Create project'),
                  style: FilledButton.styleFrom(
                      minimumSize: const Size.fromHeight(48)),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _showJoinProjectSheet(AgencyColors colors) async {
    _inviteToken.clear();
    setState(() => _actionError = null);
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (sheetContext) => StatefulBuilder(
        builder: (sheetContext, setSheet) => SafeArea(
          child: Padding(
            padding: EdgeInsets.fromLTRB(
              AgencySpacing.md,
              0,
              AgencySpacing.md,
              MediaQuery.viewInsetsOf(sheetContext).bottom + AgencySpacing.md,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: <Widget>[
                Text(
                  'Join a project',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                    color: colors.contentPrimary,
                  ),
                ),
                const SizedBox(height: AgencySpacing.xs),
                Text(
                  'The invitation code only works for the email address it '
                  'was issued to.',
                  style:
                      TextStyle(fontSize: 11, color: colors.contentSecondary),
                ),
                const SizedBox(height: AgencySpacing.md),
                TextField(
                  controller: _inviteToken,
                  autofocus: true,
                  decoration: const InputDecoration(
                    labelText: 'Invitation code',
                    prefixIcon: Icon(Icons.key_outlined),
                  ),
                ),
                const SizedBox(height: AgencySpacing.sm),
                FilledButton.icon(
                  onPressed: _busy
                      ? null
                      : () async {
                          await _acceptInvitation();
                          if (_actionError == null && sheetContext.mounted) {
                            Navigator.pop(sheetContext);
                          } else {
                            setSheet(() {});
                          }
                        },
                  icon: const Icon(Icons.login),
                  label: const Text('Join project'),
                  style: FilledButton.styleFrom(
                      minimumSize: const Size.fromHeight(48)),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _showParticipants(AgencyColors colors) async {
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (sheetContext) => StatefulBuilder(
        builder: (sheetContext, setSheet) {
          final page = _invitationPage;
          return SafeArea(
            child: Padding(
              padding: EdgeInsets.fromLTRB(
                AgencySpacing.md,
                0,
                AgencySpacing.md,
                MediaQuery.viewInsetsOf(sheetContext).bottom + AgencySpacing.md,
              ),
              child: ConstrainedBox(
                constraints: BoxConstraints(
                    maxHeight: MediaQuery.sizeOf(sheetContext).height * 0.8),
                child: ListView(
                  shrinkWrap: true,
                  children: <Widget>[
                    Text(
                      'Project participants',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                        color: colors.contentPrimary,
                      ),
                    ),
                    const SizedBox(height: AgencySpacing.xs),
                    Text(
                      '${page?.participants ?? 0} of ${page?.capacity ?? 3} participant places used',
                      style: TextStyle(
                          fontSize: 11, color: colors.contentSecondary),
                    ),
                    const SizedBox(height: AgencySpacing.md),
                    TextField(
                      controller: _inviteEmail,
                      keyboardType: TextInputType.emailAddress,
                      decoration: const InputDecoration(
                        labelText: 'Participant email',
                        prefixIcon: Icon(Icons.email_outlined),
                      ),
                    ),
                    const SizedBox(height: AgencySpacing.sm),
                    FilledButton.icon(
                      onPressed: _busy ||
                              (page != null &&
                                  page.participants >= page.capacity)
                          ? null
                          : () async {
                              await _invite();
                              setSheet(() {});
                            },
                      icon: const Icon(Icons.person_add_alt_1),
                      label: const Text('Create invitation'),
                    ),
                    if (_createdInvitation != null) ...<Widget>[
                      const SizedBox(height: AgencySpacing.md),
                      Container(
                        padding: const EdgeInsets.all(AgencySpacing.sm),
                        decoration: BoxDecoration(
                          color: colors.surfaceInteractive,
                          borderRadius: BorderRadius.circular(AgencyRadius.md),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: <Widget>[
                            const Text(
                              'Staging invitation code',
                              style: TextStyle(
                                  fontSize: 11, fontWeight: FontWeight.w700),
                            ),
                            const SizedBox(height: 4),
                            SelectableText(
                              _createdInvitation!.token,
                              style: const TextStyle(fontSize: 10),
                            ),
                            Align(
                              alignment: Alignment.centerRight,
                              child: TextButton.icon(
                                onPressed: () async {
                                  await Clipboard.setData(ClipboardData(
                                      text: _createdInvitation!.token));
                                  if (sheetContext.mounted) {
                                    ScaffoldMessenger.of(sheetContext)
                                        .showSnackBar(const SnackBar(
                                            content: Text(
                                                'Invitation code copied')));
                                  }
                                },
                                icon: const Icon(Icons.copy, size: 16),
                                label: const Text('Copy code'),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                    if (page != null &&
                        page.invitations.isNotEmpty) ...<Widget>[
                      const SizedBox(height: AgencySpacing.lg),
                      for (final invitation in page.invitations)
                        ListTile(
                          contentPadding: EdgeInsets.zero,
                          leading: const Icon(Icons.mail_outline),
                          title: Text(invitation.inviteeEmail,
                              style: const TextStyle(fontSize: 12)),
                          subtitle: Text(invitation.status,
                              style: TextStyle(
                                  fontSize: 10,
                                  color: colors.contentSecondary)),
                          trailing: invitation.canRevoke
                              ? TextButton(
                                  onPressed: _busy
                                      ? null
                                      : () async {
                                          await _revoke(invitation);
                                          setSheet(() {});
                                        },
                                  child: const Text('Revoke'),
                                )
                              : null,
                        ),
                    ],
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

class _ProductPickerSheet extends ConsumerStatefulWidget {
  const _ProductPickerSheet({required this.audience, required this.products});

  final ConversationAudience audience;
  final List<Product> products;

  @override
  ConsumerState<_ProductPickerSheet> createState() =>
      _ProductPickerSheetState();
}

class _ProductPickerSheetState extends ConsumerState<_ProductPickerSheet> {
  final TextEditingController _search = TextEditingController();

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  void _selectProduct(Product product) {
    ref.read(conversationDockProvider.notifier).discuss(
          widget.audience,
          ConversationProductCapture.fromProduct(product),
        );
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final colors =
        Theme.of(context).extension<AgencyColors>() ?? AgencyColors.light;
    final query = _search.text.trim().toLowerCase();
    final recent = query.isEmpty
        ? ref
            .watch(recentlyViewedProvider)
            .map((id) => widget.products.where((p) => p.id == id).firstOrNull)
            .whereType<Product>()
            .take(10)
            .toList()
        : const <Product>[];
    final filtered = (query.isEmpty
            ? widget.products
            : widget.products.where((p) {
                final sku =
                    p.variants.map((v) => v.sku ?? '').join(' ').toLowerCase();
                return p.title.toLowerCase().contains(query) ||
                    (p.brand ?? '').toLowerCase().contains(query) ||
                    p.id.toLowerCase().contains(query) ||
                    sku.contains(query);
              }).toList())
        .take(40)
        .toList();

    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          AgencySpacing.md,
          0,
          AgencySpacing.md,
          MediaQuery.viewInsetsOf(context).bottom + AgencySpacing.md,
        ),
        child: ConstrainedBox(
          constraints: BoxConstraints(
            maxHeight: MediaQuery.sizeOf(context).height * 0.78,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              Text(
                'Add a product',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: colors.contentPrimary,
                ),
              ),
              const SizedBox(height: AgencySpacing.xs),
              Text(
                'The product is added to this conversation. Your cart is not changed.',
                style: TextStyle(fontSize: 11, color: colors.contentSecondary),
              ),
              if (recent.isNotEmpty) ...<Widget>[
                const SizedBox(height: AgencySpacing.sm),
                Row(
                  children: <Widget>[
                    Icon(Icons.history,
                        size: 15, color: colors.contentSecondary),
                    const SizedBox(width: AgencySpacing.xs),
                    Text(
                      'Recently viewed',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: colors.contentPrimary,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: AgencySpacing.xs),
                SizedBox(
                  height: 118,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: recent.length,
                    separatorBuilder: (_, __) =>
                        const SizedBox(width: AgencySpacing.sm),
                    itemBuilder: (context, index) =>
                        _recentProductTile(colors, recent[index]),
                  ),
                ),
              ],
              const SizedBox(height: AgencySpacing.sm),
              TextField(
                controller: _search,
                autofocus: true,
                onChanged: (_) => setState(() {}),
                decoration: const InputDecoration(
                  labelText: 'Search catalogue',
                  hintText: 'Product, brand or SKU',
                  prefixIcon: Icon(Icons.search),
                ),
              ),
              const SizedBox(height: AgencySpacing.sm),
              Flexible(
                child: widget.products.isEmpty
                    ? Center(
                        child: Text(
                          'The catalogue is still loading. Please retry in a moment.',
                          textAlign: TextAlign.center,
                          style: TextStyle(color: colors.contentSecondary),
                        ),
                      )
                    : filtered.isEmpty
                        ? Center(
                            child: Text(
                              'No product matches the search.',
                              style: TextStyle(color: colors.contentSecondary),
                            ),
                          )
                        : ListView.separated(
                            shrinkWrap: true,
                            itemCount: filtered.length,
                            separatorBuilder: (_, __) =>
                                const Divider(height: 1),
                            itemBuilder: (context, index) {
                              final product = filtered[index];
                              final price = product.price?.formatted ?? '';
                              return ListTile(
                                contentPadding: EdgeInsets.zero,
                                leading: Container(
                                  width: 44,
                                  height: 44,
                                  clipBehavior: Clip.antiAlias,
                                  decoration: BoxDecoration(
                                    color: colors.surfacePage,
                                    borderRadius:
                                        BorderRadius.circular(AgencyRadius.sm),
                                  ),
                                  child: product.thumbnail == null
                                      ? Icon(Icons.inventory_2_outlined,
                                          color: colors.contentSecondary)
                                      : Image.network(
                                          product.thumbnail!,
                                          fit: BoxFit.cover,
                                          errorBuilder: (_, __, ___) => Icon(
                                              Icons.inventory_2_outlined,
                                              color: colors.contentSecondary),
                                        ),
                                ),
                                title: Text(
                                  product.title,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w600,
                                    color: colors.contentPrimary,
                                  ),
                                ),
                                subtitle: Text(
                                  '${product.brand ?? product.variantLabel}'
                                  '${price.isEmpty ? '' : ' · $price'}',
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                      fontSize: 10,
                                      color: colors.contentSecondary),
                                ),
                                trailing: IconButton(
                                  tooltip:
                                      'Add ${product.title} to conversation',
                                  onPressed: () => _selectProduct(product),
                                  icon: Icon(Icons.add_circle_outline,
                                      color: colors.actionPrimary),
                                ),
                              );
                            },
                          ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _recentProductTile(AgencyColors colors, Product product) {
    final price = product.price?.formatted ?? '';
    return SizedBox(
      width: 132,
      child: InkWell(
        borderRadius: BorderRadius.circular(AgencyRadius.sm),
        onTap: () => _selectProduct(product),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            ClipRRect(
              borderRadius: BorderRadius.circular(AgencyRadius.sm),
              child: SizedBox(
                width: 132,
                height: 64,
                child: product.thumbnail == null
                    ? ColoredBox(
                        color: colors.surfacePage,
                        child: Icon(Icons.inventory_2_outlined,
                            color: colors.contentSecondary),
                      )
                    : Image.network(
                        product.thumbnail!,
                        fit: BoxFit.cover,
                        errorBuilder: (_, __, ___) => ColoredBox(
                          color: colors.surfacePage,
                          child: Icon(Icons.inventory_2_outlined,
                              color: colors.contentSecondary),
                        ),
                      ),
              ),
            ),
            const SizedBox(height: 4),
            Text(
              product.title,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 11,
                height: 1.2,
                fontWeight: FontWeight.w600,
                color: colors.contentPrimary,
              ),
            ),
            if (price.isNotEmpty)
              Text(
                price,
                maxLines: 1,
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                  color: colors.actionPrimary,
                ),
              ),
          ],
        ),
      ),
    );
  }
}
