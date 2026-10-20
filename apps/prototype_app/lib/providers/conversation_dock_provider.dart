import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../domain/conversation_models.dart';

enum ConversationAudience { household, business }

enum ConversationDockTab { chat, sharedList }

class ConversationDockState {
  const ConversationDockState({
    this.isOpen = false,
    this.audience = ConversationAudience.household,
    this.tab = ConversationDockTab.chat,
    this.pendingCapture,
    this.captureRequest = 0,
    this.householdWorkspaceId,
    this.businessWorkspaceId,
  });

  final bool isOpen;
  final ConversationAudience audience;
  final ConversationDockTab tab;
  final ConversationProductCapture? pendingCapture;
  final int captureRequest;
  final String? householdWorkspaceId;
  final String? businessWorkspaceId;

  String? workspaceIdFor(ConversationAudience value) =>
      value == ConversationAudience.household
          ? householdWorkspaceId
          : businessWorkspaceId;

  ConversationDockState copyWith({
    bool? isOpen,
    ConversationAudience? audience,
    ConversationDockTab? tab,
    ConversationProductCapture? pendingCapture,
    bool clearPendingCapture = false,
    int? captureRequest,
    String? householdWorkspaceId,
    String? businessWorkspaceId,
  }) =>
      ConversationDockState(
        isOpen: isOpen ?? this.isOpen,
        audience: audience ?? this.audience,
        tab: tab ?? this.tab,
        pendingCapture:
            clearPendingCapture ? null : pendingCapture ?? this.pendingCapture,
        captureRequest: captureRequest ?? this.captureRequest,
        householdWorkspaceId: householdWorkspaceId ?? this.householdWorkspaceId,
        businessWorkspaceId: businessWorkspaceId ?? this.businessWorkspaceId,
      );
}

class ConversationDockNotifier extends Notifier<ConversationDockState> {
  @override
  ConversationDockState build() => const ConversationDockState();

  void open(
    ConversationAudience audience, {
    ConversationDockTab tab = ConversationDockTab.chat,
  }) {
    state = state.copyWith(isOpen: true, audience: audience, tab: tab);
  }

  void close() => state = state.copyWith(isOpen: false);

  void discuss(
    ConversationAudience audience,
    ConversationProductCapture capture,
  ) {
    state = state.copyWith(
      isOpen: true,
      audience: audience,
      tab: ConversationDockTab.chat,
      pendingCapture: capture,
      captureRequest: state.captureRequest + 1,
    );
  }

  void showSharedList(ConversationAudience audience) {
    state = state.copyWith(
      isOpen: true,
      audience: audience,
      tab: ConversationDockTab.sharedList,
    );
  }

  void selectWorkspace(ConversationAudience audience, String workspaceId) {
    state = audience == ConversationAudience.household
        ? state.copyWith(householdWorkspaceId: workspaceId)
        : state.copyWith(businessWorkspaceId: workspaceId);
  }

  void selectTab(ConversationDockTab tab) => state = state.copyWith(tab: tab);

  void clearCapture(int request) {
    if (state.captureRequest != request) return;
    state = state.copyWith(clearPendingCapture: true);
  }
}

final conversationDockProvider =
    NotifierProvider<ConversationDockNotifier, ConversationDockState>(
  ConversationDockNotifier.new,
);
