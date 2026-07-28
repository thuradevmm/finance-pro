export type SubmittedQueryDraftState = {
  appliedValue: string;
  draftValue: string;
};

export function readSubmittedQuery(
  formData: { get(name: string): FormDataEntryValue | null },
  fallback: string,
  parameter = "q",
) {
  return String(formData.get(parameter) ?? fallback);
}

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
