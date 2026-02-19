import { useNavigate } from "react-router-dom";
import { ArrowRight, Play, CheckCircle, BarChart3 } from "lucide-react";

export type ActionType = "navigate" | "simulate" | "accept" | "chart";

interface ActionButtonProps {
  label: string;
  action: ActionType;
  target?: string;
  onClick?: () => void;
}

const icons: Record<ActionType, typeof ArrowRight> = {
  navigate: ArrowRight,
  simulate: Play,
  accept: CheckCircle,
  chart: BarChart3,
};

export default function ActionButton({ label, action, target, onClick }: ActionButtonProps) {
  const navigate = useNavigate();
  const Icon = icons[action];

  const handleClick = () => {
    if (onClick) {
      onClick();
      return;
    }
    if (action === "navigate" && target) {
      navigate(target);
    }
  };

  return (
    <button
      onClick={handleClick}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-energy-teal/30 bg-energy-teal/5 text-energy-teal hover:bg-energy-teal/10 transition-colors cursor-pointer"
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}
