export type SubmittedQueryDraftState = {
  appliedValue: string;
  draftValue: string;
};

export function syncSubmittedQueryDraft(
  state: SubmittedQueryDraftState,
  appliedValue: string,
): SubmittedQueryDraftState {
  if (state.appliedValue === appliedValue) return state;
  return { appliedValue, draftValue: appliedValue };
}

export function stageSubmittedQueryDraft(
  appliedValue: string,
  draftValue: string,
): SubmittedQueryDraftState {
  return { appliedValue, draftValue };
}
