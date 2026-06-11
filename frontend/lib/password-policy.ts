export type PasswordRule = {
  id: "length" | "letter" | "number" | "special";
  label: string;
  valid: boolean;
};

export function getPasswordRules(password: string): PasswordRule[] {
  return [
    {
      id: "length",
      label: "At least 8 characters",
      valid: password.length >= 8,
    },
    {
      id: "letter",
      label: "One letter",
      valid: /[A-Za-z]/.test(password),
    },
    {
      id: "number",
      label: "One number",
      valid: /\d/.test(password),
    },
    {
      id: "special",
      label: "One special character",
      valid: /[^A-Za-z0-9]/.test(password),
    },
  ];
}

export function getPasswordPolicyError(password: string): string | null {
  const failedRules = getPasswordRules(password).filter((rule) => !rule.valid);

  if (failedRules.length === 0) {
    return null;
  }

  return "Password must include at least 8 characters, one letter, one number, and one special character.";
}
