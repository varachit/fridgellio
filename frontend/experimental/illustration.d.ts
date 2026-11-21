export function mountIllustration(
  host: HTMLElement,
  options: {
    variant: "landing" | "dashboard" | "groceries";
    animate?: boolean;
  },
): { dispose(): void };
