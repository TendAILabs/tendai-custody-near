export const TEE_MODEL = "z-ai/glm-5.3-flash";

const INCUMBENT = /^(openai|anthropic|google|gemini)\//i;

export function assertTeeModel(model: string): void {
  const name = model.trim();
  if (INCUMBENT.test(name) || name !== TEE_MODEL) {
    throw new Error(`Refusing non-TEE model id ${name || "(empty)"} at startup.`);
  }
}
