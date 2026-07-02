import { PRODUCT_NAME } from "@/constants/brand";
import { cn } from "@/lib/utils";

// Product wordmark. Currently a text placeholder ("Arnsoft Calling Agent").
// To swap in real logo art later: drop files into ui/public/ and restore the
// commented <img> renders below (theme-aware: dark logo on light surfaces,
// light logo on dark). `inverse` forces the light wordmark on an always-dark
// surface (e.g. the auth brand panel). `mark` renders a compact square monogram
// instead of the full wordmark (e.g. the app sidebar header). Height is
// controlled by the caller via className (e.g. "h-7").
export function BrandLogo({
  className,
  inverse = false,
  mark = false,
}: {
  className?: string;
  inverse?: boolean;
  mark?: boolean;
}) {
  if (mark) {
    // TODO: swap to real logo art -> <img src="/dograh-mark.png" alt={PRODUCT_NAME} ... />
    return (
      <span
        aria-label={PRODUCT_NAME}
        className={cn(
          "inline-flex aspect-square items-center justify-center rounded-md bg-foreground text-base font-bold leading-none text-background select-none",
          className,
        )}
      >
        A
      </span>
    );
  }
  // TODO: swap to real logo art -> theme-aware <img src="/dograh-logo.png" .../> + inverse variant
  return (
    <span
      aria-label={PRODUCT_NAME}
      className={cn(
        "inline-flex items-center whitespace-nowrap text-lg font-bold leading-none tracking-tight select-none",
        inverse ? "text-zinc-50" : "text-foreground",
        className,
      )}
    >
      {PRODUCT_NAME}
    </span>
  );
}
