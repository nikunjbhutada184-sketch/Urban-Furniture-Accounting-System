import { PASSWORD_RULES } from "@/modules/users/schemas";

/**
 * The password policy, spelled out beside the field.
 *
 * Purely informative: the rules are enforced by `passwordSchema` on the
 * server. This list exists so someone is not made to guess what "invalid"
 * meant after the fact.
 */
export function PasswordRules() {
  return (
    <ul className="text-muted-foreground space-y-0.5 text-xs">
      {PASSWORD_RULES.map((rule) => (
        <li key={rule} className="flex items-start gap-1.5">
          <span aria-hidden className="text-muted-foreground/60 leading-4">
            •
          </span>
          <span>{rule}</span>
        </li>
      ))}
    </ul>
  );
}
