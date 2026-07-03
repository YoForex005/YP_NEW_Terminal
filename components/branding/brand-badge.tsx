import Image from "next/image";
import { cn } from "@/lib/utils";

interface BrandBadgeProps {
  className?: string;
  imageClassName?: string;
  size?: "sm" | "md" | "lg";
  priority?: boolean;
}

const badgeStyles = {
  sm: {
    container: "h-10 px-2 py-1",
    image: "h-6 w-auto",
  },
  md: {
    container: "h-12 px-2 py-1.5",
    image: "h-8 w-auto",
  },
  lg: {
    container: "h-16 px-3 py-2",
    image: "h-10 w-auto",
  },
} as const;

export function BrandBadge({
  className,
  imageClassName,
  size = "md",
  priority = false,
}: BrandBadgeProps) {
  const style = badgeStyles[size];

  return (
    <div
      className={cn(
        "relative inline-flex items-center justify-center transition-all duration-300",
        "bg-transparent border-transparent shadow-none",
        "hover:scale-[1.03] active:scale-[0.98] select-none cursor-pointer overflow-hidden",
        style.container,
        className,
      )}
    >
      {/* Pulsing radial glow behind the logo */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at center, rgba(16,185,129,0.18) 0%, rgba(16,185,129,0.06) 40%, transparent 70%)",
          animation: "logoGlow 3s ease-in-out infinite",
        }}
      />

      {/* Sweeping shine overlay */}
      <div
        className="absolute inset-0 pointer-events-none overflow-hidden rounded-lg"
        style={{ zIndex: 2 }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: "-100%",
            width: "60%",
            height: "100%",
            background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)",
            transform: "skewX(-20deg)",
            animation: "logoShine 4s ease-in-out infinite",
          }}
        />
      </div>

      <Image
        src="/assets/logo.png"
        alt="Yopips logo"
        width={240}
        height={72}
        priority={priority}
        className={cn(
          "relative z-[1] object-contain select-none transition-all duration-500 block dark:hidden",
          "drop-shadow-[0_0_8px_rgba(16,185,129,0.3)]",
          style.image,
          imageClassName
        )}
      />
      <Image
        src="/assets/logo_white.png"
        alt="Yopips logo"
        width={240}
        height={72}
        priority={priority}
        className={cn(
          "relative z-[1] object-contain select-none transition-all duration-500 hidden dark:block",
          "drop-shadow-[0_0_12px_rgba(16,185,129,0.4)]",
          style.image,
          imageClassName
        )}
      />

      <style jsx>{`
        @keyframes logoGlow {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.15); }
        }
        @keyframes logoShine {
          0% { left: -100%; }
          50%, 100% { left: 150%; }
        }
      `}</style>
    </div>
  );
}
