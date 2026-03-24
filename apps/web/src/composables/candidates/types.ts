export interface CandidateCreateFormValue {
  name: string;
  phone: string;
  email: string;
  position: string;
  yearsOfExperience: number | undefined;
}

export interface CandidateActionFeedback {
  tone: "success" | "error" | "info";
  message: string;
}

export function createEmptyCandidateForm(): CandidateCreateFormValue {
  return {
    name: "",
    phone: "",
    email: "",
    position: "",
    yearsOfExperience: undefined,
  };
}
