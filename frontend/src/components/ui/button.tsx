import * as React from "react";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "secondary" | "ghost";
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = "default", ...props }, ref) => {
    const byVariant: Record<string, string> = {
      default: "btn btn-default",
      secondary: "btn btn-secondary",
      ghost: "btn btn-ghost",
    };
    return (
      <button
        ref={ref}
        className={`${byVariant[variant]} ${className}`}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";
