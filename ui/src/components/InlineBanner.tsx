import { AlertCircle, CheckCircle2 } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const VARIANT_STYLES = {
    error: "border-destructive/30 bg-destructive/10 text-destructive",
    success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
} as const;

export function InlineBanner({
    variant,
    className,
    children,
}: {
    variant: "error" | "success";
    className?: string;
    children: ReactNode;
}) {
    const Icon = variant === "error" ? AlertCircle : CheckCircle2;
    return (
        <div
            role={variant === "error" ? "alert" : "status"}
            className={cn(
                "flex items-start gap-2.5 rounded-lg border px-4 py-3 text-sm",
                VARIANT_STYLES[variant],
                className,
            )}
        >
            <Icon className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0">{children}</div>
        </div>
    );
}
