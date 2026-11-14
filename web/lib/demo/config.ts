export type PublicDemoConfig = {
  contractId: string;
  accounts: { clinic: string; patient: string; hospital: string; second: string; app: string };
};

export function publicDemoConfig(): PublicDemoConfig | null {
  const contractId = process.env.RELAY_CONTRACT_ID ?? "";
  const accounts = {
    clinic: process.env.CLINIC_A_ACCOUNT_ID ?? "",
    patient: process.env.DEMO_PATIENT_ACCOUNT_ID ?? "",
    hospital: process.env.HOSPITAL_B_ACCOUNT_ID ?? "",
    second: process.env.SECOND_OPINION_ACCOUNT_ID ?? "",
    app: process.env.PULSEFIT_ACCOUNT_ID ?? "",
  };
  if (!contractId || Object.values(accounts).some((id) => !id)) return null;
  return { contractId, accounts };
}
