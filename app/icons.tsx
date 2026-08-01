/**
 * Stroke icon set — one visual system for the whole app.
 * 24px grid, 1.7 stroke, round caps; every icon inherits `currentColor`
 * so it takes the color of whatever it sits in.
 */

type IconProps = { className?: string };

function Svg({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {children}
    </svg>
  );
}

export function LeafIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10Z" />
      <path d="M2 21c0-3 1.9-5.4 5.1-6" />
    </Svg>
  );
}

export function SearchIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.6-3.6" />
    </Svg>
  );
}

export function LinkIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M10.5 13.5a4.5 4.5 0 0 0 6.4 0l2.6-2.6a4.5 4.5 0 0 0-6.4-6.4l-1.3 1.3" />
      <path d="M13.5 10.5a4.5 4.5 0 0 0-6.4 0l-2.6 2.6a4.5 4.5 0 0 0 6.4 6.4l1.3-1.3" />
    </Svg>
  );
}

export function TargetIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function SwapIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M16 3.5 20 7l-4 3.5" />
      <path d="M20 7H4" />
      <path d="M8 13.5 4 17l4 3.5" />
      <path d="M4 17h16" />
    </Svg>
  );
}

export function ReceiptIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M5 3h14v18l-2.6-1.6L13.8 21 12 19.7 10.2 21l-2.6-1.6L5 21V3Z" />
      <path d="M9 8.5h6" />
      <path d="M9 12.5h6" />
    </Svg>
  );
}

export function CartIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="9.5" cy="20" r="1.4" />
      <circle cx="18" cy="20" r="1.4" />
      <path d="M2.5 3.5H5l2.6 12.1h11l1.9-8.4H6.2" />
    </Svg>
  );
}

export function StepsIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="4.5" cy="6" r="1.2" />
      <circle cx="4.5" cy="12" r="1.2" />
      <circle cx="4.5" cy="18" r="1.2" />
      <path d="M9.5 6H21" />
      <path d="M9.5 12H21" />
      <path d="M9.5 18H21" />
    </Svg>
  );
}

export function PinIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M20 10.5c0 6-8 11.5-8 11.5S4 16.5 4 10.5a8 8 0 1 1 16 0Z" />
      <circle cx="12" cy="10.2" r="2.8" />
    </Svg>
  );
}

export function NotebookIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="4.5" y="3" width="15" height="18" rx="2.5" />
      <path d="M9 3v18" />
      <path d="M12.5 8.5h4" />
      <path d="M12.5 12.5h4" />
    </Svg>
  );
}

export function CopyIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="9" y="9" width="12" height="12" rx="2.5" />
      <path d="M5.5 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v.5" />
    </Svg>
  );
}

export function CheckIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M20 6.5 9.5 17 4 11.5" />
    </Svg>
  );
}

export function CheckCircleIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
    </Svg>
  );
}

export function AlertIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5" />
      <path d="M12 16.2h.01" />
    </Svg>
  );
}

export function PlusIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </Svg>
  );
}

export function CloseIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </Svg>
  );
}

export function ChevronDownIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="m6 9.5 6 6 6-6" />
    </Svg>
  );
}

export function SunIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2.5M12 19.5V22M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2 12h2.5M19.5 12H22M4.2 19.8 6 18M18 6l1.8-1.8" />
    </Svg>
  );
}

export function MoonIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
    </Svg>
  );
}

export function ClockIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5.3l3.3 2" />
    </Svg>
  );
}

export function BowlIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M3 11h18a9 9 0 0 1-18 0Z" />
      <path d="M6.5 11a5.5 5.5 0 0 1 11 0" />
      <path d="M5 21h14" />
    </Svg>
  );
}

export function TrashIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M3.5 6h17" />
      <path d="M9 6V4h6v2" />
      <path d="M6.5 6 7.5 20h9L17.5 6" />
    </Svg>
  );
}
