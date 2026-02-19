import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  User,
  Globe,
  Plug,
  Clock,
  Bell,
  Monitor,
  Bot,
  Database,
  Info,
  Plus,
  Trash2,
  RotateCcw,
  Download,
  Upload,
  Save,
} from "lucide-react";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import {
  useSettingsStore,
  type Theme,
  type DensityLevel,
  type UnitSystem,
  type Currency,
  type Region,
  type ForecastHorizon,
  type TouTier,
  type Appliance,
} from "@/stores/useSettingsStore";

// ---------------------------------------------------------------------------
// Section wrapper
// ---------------------------------------------------------------------------

function Section({
  icon: Icon,
  title,
  description,
  defaultOpen = false,
  children,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-border bg-card">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-3 w-full px-5 py-4 text-left cursor-pointer"
      >
        <div className="w-8 h-8 rounded-lg bg-energy-blue/10 flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4 text-energy-blue" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-card-title text-foreground">{title}</h3>
          <p className="text-small text-muted-foreground truncate">
            {description}
          </p>
        </div>
        {open ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        )}
      </button>
      {open && (
        <div className="px-5 pb-5 border-t border-border pt-4">{children}</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared field components
// ---------------------------------------------------------------------------

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-small font-medium text-foreground">{label}</label>
      {children}
      {hint && <p className="text-small text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-body text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function NumberInput({
  value,
  onChange,
  min,
  max,
  step,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-body text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
    />
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-body text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
    />
  );
}

function Toggle({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${
        enabled ? "bg-energy-blue" : "bg-border"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
          enabled ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

function SegmentedControl({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex rounded-lg border border-border overflow-hidden">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`flex-1 px-3 py-1.5 text-small font-medium transition-colors cursor-pointer ${
            value === o.value
              ? "bg-energy-blue text-white"
              : "bg-background text-muted-foreground hover:text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Region / Currency / Unit data
// ---------------------------------------------------------------------------

const REGIONS: { value: Region; label: string }[] = [
  { value: "france", label: "France" },
  { value: "canada", label: "Canada" },
  { value: "us", label: "United States" },
  { value: "uk", label: "United Kingdom" },
  { value: "germany", label: "Germany" },
  { value: "australia", label: "Australia" },
];

const CURRENCIES: { value: Currency; label: string; symbol: string }[] = [
  { value: "EUR", label: "Euro (EUR)", symbol: "\u20AC" },
  { value: "CAD", label: "Canadian Dollar (CAD)", symbol: "CA$" },
  { value: "USD", label: "US Dollar (USD)", symbol: "$" },
  { value: "GBP", label: "British Pound (GBP)", symbol: "\u00A3" },
  { value: "AUD", label: "Australian Dollar (AUD)", symbol: "A$" },
  { value: "CHF", label: "Swiss Franc (CHF)", symbol: "CHF" },
];

const HOUSEHOLD_TYPES = [
  { value: "apartment", label: "Apartment" },
  { value: "house", label: "House" },
  { value: "townhouse", label: "Townhouse" },
  { value: "condo", label: "Condo" },
];

const CLIMATE_ZONES = [
  { value: "tropical", label: "Tropical" },
  { value: "arid", label: "Arid" },
  { value: "temperate", label: "Temperate" },
  { value: "continental", label: "Continental" },
  { value: "polar", label: "Polar" },
];

const ICON_OPTIONS = [
  "utensils",
  "shirt",
  "wind",
  "plug-zap",
  "flame",
  "snowflake",
  "tv",
  "monitor",
  "zap",
  "battery",
];

// ---------------------------------------------------------------------------
// Profile Section
// ---------------------------------------------------------------------------

function ProfileSection() {
  const {
    householdType,
    occupants,
    floorArea,
    climateZone,
    setHouseholdType,
    setOccupants,
    setFloorArea,
    setClimateZone,
  } = useSettingsStore();

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Field label="Household type">
        <Select
          value={householdType}
          onChange={setHouseholdType}
          options={HOUSEHOLD_TYPES}
        />
      </Field>
      <Field label="Number of occupants">
        <NumberInput value={occupants} onChange={setOccupants} min={1} max={20} />
      </Field>
      <Field label="Floor area (m\u00B2)">
        <NumberInput
          value={floorArea}
          onChange={setFloorArea}
          min={10}
          max={1000}
        />
      </Field>
      <Field label="Climate zone">
        <Select
          value={climateZone}
          onChange={setClimateZone}
          options={CLIMATE_ZONES}
        />
      </Field>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Regional Section
// ---------------------------------------------------------------------------

function RegionalSection() {
  const {
    region,
    unitSystem,
    currency,
    exchangeRate,
    setRegion,
    setUnitSystem,
    setCurrency,
    setExchangeRate,
  } = useSettingsStore();

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Field
        label="Region"
        hint="Affects TOU schedule defaults and holiday calendar"
      >
        <Select
          value={region}
          onChange={(v) => setRegion(v as Region)}
          options={REGIONS}
        />
      </Field>
      <Field label="Unit system">
        <SegmentedControl
          value={unitSystem}
          onChange={(v) => setUnitSystem(v as UnitSystem)}
          options={[
            { value: "metric", label: "Metric (kW, \u00B0C)" },
            { value: "imperial", label: "Imperial (BTU, \u00B0F)" },
          ]}
        />
      </Field>
      <Field label="Currency">
        <Select
          value={currency}
          onChange={(v) => setCurrency(v as Currency)}
          options={CURRENCIES}
        />
      </Field>
      <Field
        label="Exchange rate (to EUR)"
        hint="1 EUR = X of your currency. Used for cost display."
      >
        <NumberInput
          value={exchangeRate}
          onChange={setExchangeRate}
          min={0.01}
          max={1000}
          step={0.01}
        />
      </Field>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Appliance Registry Section
// ---------------------------------------------------------------------------

function ApplianceRow({
  appliance,
  onUpdate,
  onRemove,
}: {
  appliance: Appliance;
  onUpdate: (id: string, u: Partial<Appliance>) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-[1fr_80px_80px_100px_60px_40px] gap-2 items-center">
      <TextInput
        value={appliance.name}
        onChange={(v) => onUpdate(appliance.id, { name: v })}
      />
      <NumberInput
        value={appliance.powerKw}
        onChange={(v) => onUpdate(appliance.id, { powerKw: v })}
        min={0.1}
        step={0.1}
      />
      <NumberInput
        value={appliance.durationHours}
        onChange={(v) => onUpdate(appliance.id, { durationHours: v })}
        min={0.5}
        step={0.5}
      />
      <div className="flex gap-1">
        <NumberInput
          value={appliance.allowedWindow[0]}
          onChange={(v) =>
            onUpdate(appliance.id, {
              allowedWindow: [v, appliance.allowedWindow[1]],
            })
          }
          min={0}
          max={24}
        />
        <span className="text-muted-foreground self-center">\u2013</span>
        <NumberInput
          value={appliance.allowedWindow[1]}
          onChange={(v) =>
            onUpdate(appliance.id, {
              allowedWindow: [appliance.allowedWindow[0], v],
            })
          }
          min={0}
          max={24}
        />
      </div>
      <Toggle
        enabled={appliance.preemptable}
        onChange={(v) => onUpdate(appliance.id, { preemptable: v })}
      />
      <button
        onClick={() => onRemove(appliance.id)}
        className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-energy-red hover:bg-energy-red/10 transition-colors cursor-pointer"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

function ApplianceSection() {
  const { appliances, addAppliance, removeAppliance, updateAppliance } =
    useSettingsStore();

  const handleAdd = () => {
    const id = `appliance_${Date.now()}`;
    addAppliance({
      id,
      name: "New Appliance",
      icon: "zap",
      powerKw: 1.0,
      durationHours: 1.0,
      allowedWindow: [0, 24],
      preemptable: false,
    });
  };

  return (
    <div className="space-y-3">
      {/* Column headers */}
      <div className="grid grid-cols-[1fr_80px_80px_100px_60px_40px] gap-2 text-small font-medium text-muted-foreground">
        <span>Name</span>
        <span>kW</span>
        <span>Hours</span>
        <span>Window</span>
        <span>Flex</span>
        <span />
      </div>
      {appliances.map((a) => (
        <ApplianceRow
          key={a.id}
          appliance={a}
          onUpdate={updateAppliance}
          onRemove={removeAppliance}
        />
      ))}
      <button
        onClick={handleAdd}
        className="flex items-center gap-2 px-3 py-2 text-small font-medium text-energy-blue hover:bg-energy-blue/10 rounded-lg transition-colors cursor-pointer"
      >
        <Plus className="w-4 h-4" />
        Add appliance
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TOU Pricing Section
// ---------------------------------------------------------------------------

function TouRow({
  tier,
  index,
  onUpdate,
  onRemove,
}: {
  tier: TouTier;
  index: number;
  onUpdate: (i: number, u: Partial<TouTier>) => void;
  onRemove: (i: number) => void;
}) {
  const tierColour =
    tier.label === "Off-Peak"
      ? "bg-energy-green/20 text-energy-green"
      : tier.label === "On-Peak"
        ? "bg-energy-red/20 text-energy-red"
        : "bg-energy-orange/20 text-energy-orange";

  return (
    <div className="grid grid-cols-[120px_80px_80px_100px_40px] gap-2 items-center">
      <div className="flex items-center gap-2">
        <span
          className={`px-2 py-0.5 rounded text-small font-medium ${tierColour}`}
        >
          {tier.label}
        </span>
      </div>
      <NumberInput
        value={tier.startHour}
        onChange={(v) => onUpdate(index, { startHour: v })}
        min={0}
        max={23}
      />
      <NumberInput
        value={tier.endHour}
        onChange={(v) => onUpdate(index, { endHour: v })}
        min={0}
        max={24}
      />
      <NumberInput
        value={tier.rate}
        onChange={(v) => onUpdate(index, { rate: v })}
        min={0}
        step={0.001}
      />
      <button
        onClick={() => onRemove(index)}
        className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-energy-red hover:bg-energy-red/10 transition-colors cursor-pointer"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

function PricingSection() {
  const { touSchedule, setTouSchedule, currency } = useSettingsStore();
  const sym = CURRENCIES.find((c) => c.value === currency)?.symbol ?? "\u20AC";

  const updateTier = (index: number, updates: Partial<TouTier>) => {
    const next = touSchedule.map((t, i) =>
      i === index ? { ...t, ...updates } : t,
    );
    setTouSchedule(next);
  };

  const removeTier = (index: number) => {
    setTouSchedule(touSchedule.filter((_, i) => i !== index));
  };

  const addTier = () => {
    setTouSchedule([
      ...touSchedule,
      { label: "Custom", startHour: 0, endHour: 6, rate: 0.1 },
    ]);
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[120px_80px_80px_100px_40px] gap-2 text-small font-medium text-muted-foreground">
        <span>Tier</span>
        <span>From</span>
        <span>To</span>
        <span>Rate ({sym}/kWh)</span>
        <span />
      </div>
      {touSchedule.map((tier, i) => (
        <TouRow
          key={`${tier.label}-${i}`}
          tier={tier}
          index={i}
          onUpdate={updateTier}
          onRemove={removeTier}
        />
      ))}
      <button
        onClick={addTier}
        className="flex items-center gap-2 px-3 py-2 text-small font-medium text-energy-blue hover:bg-energy-blue/10 rounded-lg transition-colors cursor-pointer"
      >
        <Plus className="w-4 h-4" />
        Add tier
      </button>

      {/* 24h visual strip */}
      <div className="mt-4">
        <p className="text-small text-muted-foreground mb-2">
          24-hour schedule preview
        </p>
        <div className="flex h-6 rounded-lg overflow-hidden border border-border">
          {Array.from({ length: 24 }, (_, h) => {
            const tier = touSchedule.find((t) =>
              t.startHour < t.endHour
                ? h >= t.startHour && h < t.endHour
                : h >= t.startHour || h < t.endHour,
            );
            const bg =
              tier?.label === "Off-Peak"
                ? "bg-energy-green/40"
                : tier?.label === "On-Peak"
                  ? "bg-energy-red/40"
                  : "bg-energy-orange/40";
            return (
              <div
                key={h}
                className={`flex-1 ${bg} border-r border-border/30 last:border-r-0`}
                title={`${h}:00 — ${tier?.label ?? "Unset"} (${sym}${tier?.rate?.toFixed(3) ?? "?"})`}
              />
            );
          })}
        </div>
        <div className="flex justify-between text-small text-muted-foreground mt-1">
          <span>0:00</span>
          <span>6:00</span>
          <span>12:00</span>
          <span>18:00</span>
          <span>24:00</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notifications Section
// ---------------------------------------------------------------------------

function NotificationsSection() {
  const {
    peakAlertEnabled,
    budgetAlertEnabled,
    budgetLimit,
    setPeakAlertEnabled,
    setBudgetAlertEnabled,
    setBudgetLimit,
    currency,
  } = useSettingsStore();
  const sym = CURRENCIES.find((c) => c.value === currency)?.symbol ?? "\u20AC";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-body text-foreground font-medium">
            Peak-risk alerts
          </p>
          <p className="text-small text-muted-foreground">
            Notify when forecast exceeds peak threshold
          </p>
        </div>
        <Toggle enabled={peakAlertEnabled} onChange={setPeakAlertEnabled} />
      </div>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-body text-foreground font-medium">
            Budget breach alerts
          </p>
          <p className="text-small text-muted-foreground">
            Notify when estimated daily cost exceeds limit
          </p>
        </div>
        <Toggle enabled={budgetAlertEnabled} onChange={setBudgetAlertEnabled} />
      </div>
      {budgetAlertEnabled && (
        <Field label={`Daily budget limit (${sym})`}>
          <NumberInput
            value={budgetLimit}
            onChange={setBudgetLimit}
            min={0}
            step={0.5}
          />
        </Field>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Display Section
// ---------------------------------------------------------------------------

function DisplaySection() {
  const {
    theme,
    density,
    defaultHorizon,
    setTheme,
    setDensity,
    setDefaultHorizon,
  } = useSettingsStore();

  return (
    <div className="space-y-4">
      <Field label="Theme">
        <SegmentedControl
          value={theme}
          onChange={(v) => setTheme(v as Theme)}
          options={[
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
            { value: "system", label: "System" },
          ]}
        />
      </Field>
      <Field label="Default density">
        <SegmentedControl
          value={density}
          onChange={(v) => setDensity(v as DensityLevel)}
          options={[
            { value: "glance", label: "Glance" },
            { value: "explore", label: "Explore" },
            { value: "deep_dive", label: "Deep Dive" },
          ]}
        />
      </Field>
      <Field label="Default forecast horizon">
        <SegmentedControl
          value={defaultHorizon}
          onChange={(v) => setDefaultHorizon(v as ForecastHorizon)}
          options={[
            { value: "24h", label: "24 hours" },
            { value: "48h", label: "48 hours" },
            { value: "7d", label: "7 days" },
          ]}
        />
      </Field>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LLM Section
// ---------------------------------------------------------------------------

function LlmSection() {
  const {
    llmModel,
    narrationMode,
    llmTemperature,
    maxToolCalls,
    ollamaUrl,
    setLlmModel,
    setNarrationMode,
    setLlmTemperature,
    setMaxToolCalls,
    setOllamaUrl,
  } = useSettingsStore();

  return (
    <div className="space-y-4">
      <Field label="Ollama URL">
        <TextInput value={ollamaUrl} onChange={setOllamaUrl} />
      </Field>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Model" hint="Must be pulled in Ollama first">
          <Select
            value={llmModel}
            onChange={setLlmModel}
            options={[
              { value: "llama3:8b", label: "Llama 3 8B" },
              { value: "llama3:70b", label: "Llama 3 70B" },
              { value: "deepseek-r1:1.5b", label: "DeepSeek-R1 1.5B" },
              { value: "deepseek-r1:7b", label: "DeepSeek-R1 7B" },
              { value: "mistral:7b", label: "Mistral 7B" },
              { value: "qwen2:7b", label: "Qwen2 7B" },
            ]}
          />
        </Field>
        <Field label="Narration mode">
          <SegmentedControl
            value={narrationMode}
            onChange={(v) =>
              setNarrationMode(v as "auto" | "manual" | "off")
            }
            options={[
              { value: "auto", label: "Auto" },
              { value: "manual", label: "Manual" },
              { value: "off", label: "Off" },
            ]}
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label={`Temperature (${llmTemperature.toFixed(1)})`}>
          <input
            type="range"
            min={0}
            max={1}
            step={0.1}
            value={llmTemperature}
            onChange={(e) => setLlmTemperature(Number(e.target.value))}
            className="w-full accent-energy-blue"
          />
        </Field>
        <Field label="Max tool calls per message">
          <NumberInput
            value={maxToolCalls}
            onChange={setMaxToolCalls}
            min={1}
            max={10}
          />
        </Field>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Data Section
// ---------------------------------------------------------------------------

function DataSection() {
  const [showReset, setShowReset] = useState(false);
  const resetAll = useSettingsStore((s) => s.resetAll);

  const handleExport = () => {
    const raw = localStorage.getItem("energy-idss-settings");
    if (!raw) return;
    const blob = new Blob([raw], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "energy-idss-settings.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = reader.result as string;
          localStorage.setItem("energy-idss-settings", data);
          window.location.reload();
        } catch {
          // silently ignore bad files
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-4 py-2 text-small font-medium rounded-lg border border-border text-foreground hover:bg-muted transition-colors cursor-pointer"
        >
          <Download className="w-4 h-4" />
          Export settings
        </button>
        <button
          onClick={handleImport}
          className="flex items-center gap-2 px-4 py-2 text-small font-medium rounded-lg border border-border text-foreground hover:bg-muted transition-colors cursor-pointer"
        >
          <Upload className="w-4 h-4" />
          Import settings
        </button>
      </div>
      <div className="pt-2 border-t border-border">
        <button
          onClick={() => setShowReset(true)}
          className="flex items-center gap-2 px-4 py-2 text-small font-medium rounded-lg text-energy-red hover:bg-energy-red/10 transition-colors cursor-pointer"
        >
          <RotateCcw className="w-4 h-4" />
          Reset all settings to defaults
        </button>
      </div>
      <ConfirmDialog
        open={showReset}
        title="Reset all settings?"
        message="This will restore all settings to their default values. Your appliance registry and TOU schedule will also be reset."
        confirmLabel="Reset"
        variant="danger"
        onConfirm={() => {
          resetAll();
          setShowReset(false);
        }}
        onCancel={() => setShowReset(false)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// About Section
// ---------------------------------------------------------------------------

function AboutSection() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[140px_1fr] gap-2 text-body">
        <span className="text-muted-foreground">Project</span>
        <span className="text-foreground">
          Household Energy IDSS — MSE 433
        </span>
        <span className="text-muted-foreground">Dataset</span>
        <span className="text-foreground">
          UCI Individual Household Electric Power Consumption
        </span>
        <span className="text-muted-foreground">Period</span>
        <span className="text-foreground">Dec 2006 — Nov 2010</span>
        <span className="text-muted-foreground">Models</span>
        <span className="text-foreground">
          Seasonal Naive, Ridge Regression, XGBoost (24h direct)
        </span>
        <span className="text-muted-foreground">Test MAE</span>
        <span className="text-foreground text-mono">
          Naive 0.566 | Ridge 0.212 | XGB 0.276 kWh
        </span>
        <span className="text-muted-foreground">Conformal</span>
        <span className="text-foreground">
          90% prediction intervals (split conformal)
        </span>
        <span className="text-muted-foreground">Optimizer</span>
        <span className="text-foreground">MILP via PuLP + CBC solver</span>
        <span className="text-muted-foreground">Version</span>
        <span className="text-foreground text-mono">2.0.0-react</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function Settings() {
  return (
    <div className="space-y-4">
      <h2 className="text-page-title mb-2">Settings</h2>
      <p className="text-body text-muted-foreground mb-6">
        Configure your household profile, regional preferences, appliance
        registry, pricing, and display options.
      </p>

      <Section
        icon={User}
        title="Profile"
        description="Household type, occupants, floor area, climate zone"
        defaultOpen
      >
        <ProfileSection />
      </Section>

      <Section
        icon={Globe}
        title="Region & Units"
        description="Region, currency, unit system, exchange rate"
        defaultOpen
      >
        <RegionalSection />
      </Section>

      <Section
        icon={Plug}
        title="Appliance Registry"
        description="Flexible appliances available for load shifting"
      >
        <ApplianceSection />
      </Section>

      <Section
        icon={Clock}
        title="TOU Pricing"
        description="Time-of-use schedule with tiered rates"
      >
        <PricingSection />
      </Section>

      <Section
        icon={Bell}
        title="Notifications"
        description="Peak-risk and budget breach alerts"
      >
        <NotificationsSection />
      </Section>

      <Section
        icon={Monitor}
        title="Display"
        description="Theme, density, default forecast horizon"
      >
        <DisplaySection />
      </Section>

      <Section
        icon={Bot}
        title="LLM Assistant"
        description="Model, narration mode, temperature, tool calls"
      >
        <LlmSection />
      </Section>

      <Section
        icon={Database}
        title="Data"
        description="Import, export, and reset settings"
      >
        <DataSection />
      </Section>

      <Section
        icon={Info}
        title="About"
        description="Model versions, dataset info, project credits"
      >
        <AboutSection />
      </Section>
    </div>
  );
}
