import { useState, useRef, useEffect } from "react";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, isSameDay, isWithinInterval, startOfWeek, endOfWeek } from "date-fns";

interface DateRangePickerProps {
  from: Date | null;
  to: Date | null;
  onChange: (from: Date | null, to: Date | null) => void;
  minDate?: Date;
  maxDate?: Date;
}

const presets = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "Last year", days: 365 },
];

export default function DateRangePicker({ from, to, onChange, minDate, maxDate }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(from ?? new Date());
  const [picking, setPicking] = useState<"from" | "to">("from");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const monthStart = startOfMonth(viewMonth);
  const monthEnd = endOfMonth(viewMonth);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  function handleDayClick(day: Date) {
    if (picking === "from") {
      onChange(day, to && day <= to ? to : null);
      setPicking("to");
    } else {
      if (from && day >= from) {
        onChange(from, day);
        setPicking("from");
        setOpen(false);
      } else {
        onChange(day, null);
        setPicking("to");
      }
    }
  }

  function applyPreset(days: number) {
    const end = maxDate ?? new Date();
    const start = new Date(end.getTime() - days * 86400000);
    onChange(start, end);
    setOpen(false);
  }

  const displayText = from && to
    ? `${format(from, "MMM d, yyyy")} - ${format(to, "MMM d, yyyy")}`
    : from
      ? `${format(from, "MMM d, yyyy")} - ...`
      : "Select date range";

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 text-small border border-border rounded-lg bg-card text-foreground hover:border-energy-blue/40 transition-colors cursor-pointer w-full"
      >
        <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className="truncate">{displayText}</span>
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 z-40 bg-card rounded-xl border border-border shadow-xl p-4 w-[320px]">
          {/* Presets */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {presets.map((p) => (
              <button
                key={p.days}
                onClick={() => applyPreset(p.days)}
                className="px-2.5 py-1 text-[11px] font-medium rounded-md bg-muted text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Calendar nav */}
          <div className="flex items-center justify-between mb-2">
            <button onClick={() => setViewMonth(subMonths(viewMonth, 1))} className="p-1 hover:bg-muted rounded cursor-pointer">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-card-title">{format(viewMonth, "MMMM yyyy")}</span>
            <button onClick={() => setViewMonth(addMonths(viewMonth, 1))} className="p-1 hover:bg-muted rounded cursor-pointer">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
              <div key={d} className="text-center text-[11px] text-muted-foreground py-1">{d}</div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-0.5">
            {days.map((day) => {
              const isCurrentMonth = day.getMonth() === viewMonth.getMonth();
              const isStart = from && isSameDay(day, from);
              const isEnd = to && isSameDay(day, to);
              const inRange = from && to && isWithinInterval(day, { start: from, end: to });
              const disabled = (minDate && day < minDate) || (maxDate && day > maxDate);

              return (
                <button
                  key={day.toISOString()}
                  disabled={disabled}
                  onClick={() => handleDayClick(day)}
                  className={`w-full aspect-square flex items-center justify-center text-[12px] rounded-md transition-colors cursor-pointer
                    ${!isCurrentMonth ? "text-muted-foreground/40" : ""}
                    ${disabled ? "opacity-30 cursor-not-allowed" : ""}
                    ${isStart || isEnd ? "bg-energy-blue text-white font-medium" : ""}
                    ${inRange && !isStart && !isEnd ? "bg-energy-blue/10" : ""}
                    ${!isStart && !isEnd && !inRange && isCurrentMonth ? "hover:bg-muted" : ""}
                  `}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
