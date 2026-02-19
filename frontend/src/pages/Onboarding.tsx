import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Zap,
  Globe,
  Home,
  Bot,
  ChevronRight,
  ChevronLeft,
  ArrowRight,
  MapPin,
  DollarSign,
  Users,
  Ruler,
  Cloud,
  Link,
  Cpu,
} from "lucide-react";
import {
  useSettingsStore,
  type Region,
  type Currency,
} from "@/stores/useSettingsStore";

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const REGIONS: { value: Region; label: string; flag: string }[] = [
  { value: "canada", label: "Canada", flag: "CA" },
  { value: "france", label: "France", flag: "FR" },
  { value: "us", label: "United States", flag: "US" },
  { value: "uk", label: "United Kingdom", flag: "GB" },
  { value: "germany", label: "Germany", flag: "DE" },
  { value: "australia", label: "Australia", flag: "AU" },
];

const CURRENCIES: { value: Currency; label: string }[] = [
  { value: "CAD", label: "CAD ($)" },
  { value: "EUR", label: "EUR (\u20AC)" },
  { value: "USD", label: "USD ($)" },
  { value: "GBP", label: "GBP (\u00A3)" },
  { value: "AUD", label: "AUD ($)" },
  { value: "CHF", label: "CHF" },
];

const HOUSEHOLD_TYPES = [
  { value: "house", label: "House", icon: Home },
  { value: "apartment", label: "Apartment", icon: Home },
  { value: "townhouse", label: "Townhouse", icon: Home },
  { value: "condo", label: "Condo", icon: Home },
];

const CLIMATE_ZONES = [
  { value: "temperate", label: "Temperate" },
  { value: "continental", label: "Continental" },
  { value: "tropical", label: "Tropical" },
  { value: "arid", label: "Arid" },
  { value: "polar", label: "Polar" },
];


// ---------------------------------------------------------------------------
// Shared Components
// ---------------------------------------------------------------------------

function SelectCard({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        relative px-4 py-3 rounded-xl border-2 text-left transition-all duration-200 cursor-pointer
        ${
          selected
            ? "border-energy-blue bg-energy-blue/5 shadow-sm"
            : "border-border bg-card hover:border-energy-blue/30 hover:bg-card"
        }
      `}
    >
      {selected && (
        <motion.div
          layoutId="select-indicator"
          className="absolute top-2 right-2 w-2 h-2 rounded-full bg-energy-blue"
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
        />
      )}
      {children}
    </button>
  );
}

function FieldLabel({
  icon: Icon,
  label,
}: {
  icon: React.ElementType;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <Icon className="w-3.5 h-3.5 text-energy-blue" />
      <span className="text-small font-medium text-foreground">{label}</span>
    </div>
  );
}

function SelectInput({
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
      className="w-full rounded-xl border-2 border-border bg-card px-3.5 py-2.5 text-body text-foreground focus:outline-none focus:border-energy-blue transition-colors"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function NumberField({
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
      className="w-full rounded-xl border-2 border-border bg-card px-3.5 py-2.5 text-body text-foreground focus:outline-none focus:border-energy-blue transition-colors"
    />
  );
}

function TextFieldInput({
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
      className="w-full rounded-xl border-2 border-border bg-card px-3.5 py-2.5 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-energy-blue transition-colors"
    />
  );
}

// ---------------------------------------------------------------------------
// Step Indicator
// ---------------------------------------------------------------------------

const STEPS = [
  { label: "Region", icon: Globe },
  { label: "Household", icon: Home },
  { label: "Assistant", icon: Bot },
];

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-1">
      {STEPS.map((step, i) => {
        const Icon = step.icon;
        const isActive = i === current;
        const isDone = i < current;
        return (
          <div key={step.label} className="flex items-center gap-1">
            {i > 0 && (
              <div
                className={`w-8 h-px mx-1 transition-colors duration-300 ${
                  isDone ? "bg-energy-blue" : "bg-border"
                }`}
              />
            )}
            <div
              className={`
                flex items-center gap-1.5 px-3 py-1.5 rounded-full text-small font-medium transition-all duration-300
                ${
                  isActive
                    ? "bg-energy-blue text-white"
                    : isDone
                      ? "bg-energy-blue/10 text-energy-blue"
                      : "bg-muted text-muted-foreground"
                }
              `}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{step.label}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1: Region & Currency
// ---------------------------------------------------------------------------

function StepRegion() {
  const { region, currency, setRegion, setCurrency, setExchangeRate } =
    useSettingsStore();

  const handleRegion = (r: Region) => {
    setRegion(r);
    // Auto-set currency and exchange rate based on region
    const map: Record<Region, { currency: Currency; rate: number }> = {
      canada: { currency: "CAD", rate: 1.5 },
      france: { currency: "EUR", rate: 1.0 },
      us: { currency: "USD", rate: 1.08 },
      uk: { currency: "GBP", rate: 0.86 },
      germany: { currency: "EUR", rate: 1.0 },
      australia: { currency: "AUD", rate: 1.65 },
    };
    setCurrency(map[r].currency);
    setExchangeRate(map[r].rate);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-page-title text-foreground mb-1">
          Welcome to Energy IDSS
        </h2>
        <p className="text-body text-muted-foreground">
          Your intelligent household energy dashboard. Let's personalize your
          experience in a few quick steps.
        </p>
      </div>

      <div>
        <FieldLabel icon={MapPin} label="Your region" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {REGIONS.map((r) => (
            <SelectCard
              key={r.value}
              selected={region === r.value}
              onClick={() => handleRegion(r.value)}
            >
              <span className="text-body font-medium text-foreground">
                {r.label}
              </span>
            </SelectCard>
          ))}
        </div>
      </div>

      <div>
        <FieldLabel icon={DollarSign} label="Display currency" />
        <SelectInput
          value={currency}
          onChange={(v) => setCurrency(v as Currency)}
          options={CURRENCIES}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2: Household
// ---------------------------------------------------------------------------

function StepHousehold() {
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
    <div className="space-y-6">
      <div>
        <h2 className="text-page-title text-foreground mb-1">
          Your Household
        </h2>
        <p className="text-body text-muted-foreground">
          These details help the model provide more accurate forecasts and
          recommendations.
        </p>
      </div>

      <div>
        <FieldLabel icon={Home} label="Dwelling type" />
        <div className="grid grid-cols-2 gap-2">
          {HOUSEHOLD_TYPES.map((t) => (
            <SelectCard
              key={t.value}
              selected={householdType === t.value}
              onClick={() => setHouseholdType(t.value)}
            >
              <span className="text-body font-medium text-foreground">
                {t.label}
              </span>
            </SelectCard>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <FieldLabel icon={Users} label="Occupants" />
          <NumberField
            value={occupants}
            onChange={setOccupants}
            min={1}
            max={20}
          />
        </div>
        <div>
          <FieldLabel icon={Ruler} label="Floor area (m\u00B2)" />
          <NumberField
            value={floorArea}
            onChange={setFloorArea}
            min={10}
            max={1000}
          />
        </div>
      </div>

      <div>
        <FieldLabel icon={Cloud} label="Climate zone" />
        <SelectInput
          value={climateZone}
          onChange={setClimateZone}
          options={CLIMATE_ZONES}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3: LLM Assistant
// ---------------------------------------------------------------------------

function StepAssistant() {
  const { ollamaUrl, llmModel, setOllamaUrl } = useSettingsStore();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-page-title text-foreground mb-1">AI Assistant</h2>
        <p className="text-body text-muted-foreground">
          The dashboard includes an LLM-powered chat assistant for natural
          language insights. It runs locally via Ollama.
        </p>
      </div>

      <div className="rounded-xl border border-energy-teal/30 bg-energy-teal/5 px-4 py-3">
        <p className="text-small text-energy-teal font-medium mb-1">
          Ollama must be running
        </p>
        <p className="text-small text-muted-foreground">
          Install from{" "}
          <span className="text-mono text-foreground">ollama.com</span>, then
          run <span className="text-mono text-foreground">ollama serve</span>{" "}
          and{" "}
          <span className="text-mono text-foreground">
            ollama pull {llmModel}
          </span>
        </p>
      </div>

      <div>
        <FieldLabel icon={Link} label="Ollama server URL" />
        <TextFieldInput
          value={ollamaUrl}
          onChange={setOllamaUrl}
          placeholder="http://localhost:11434"
        />
      </div>

      <div>
        <FieldLabel icon={Cpu} label="Model" />
        <div className="rounded-xl border-2 border-border bg-muted/50 px-3.5 py-2.5">
          <span className="text-body text-foreground">{llmModel}</span>
          <span className="text-small text-muted-foreground ml-2">
            (set via VITE_OLLAMA_MODEL in .env)
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Slide variants
// ---------------------------------------------------------------------------

const slideVariants = {
  enter: (dir: number) => ({
    x: dir > 0 ? 80 : -80,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (dir: number) => ({
    x: dir > 0 ? -80 : 80,
    opacity: 0,
  }),
};

// ---------------------------------------------------------------------------
// Main Onboarding Page
// ---------------------------------------------------------------------------

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const navigate = useNavigate();
  const completeOnboarding = useSettingsStore((s) => s.completeOnboarding);

  const next = () => {
    if (step < 2) {
      setDirection(1);
      setStep(step + 1);
    }
  };

  const back = () => {
    if (step > 0) {
      setDirection(-1);
      setStep(step - 1);
    }
  };

  const finish = () => {
    completeOnboarding();
    navigate("/");
  };

  const skip = () => {
    completeOnboarding();
    navigate("/");
  };

  const steps = [<StepRegion />, <StepHousehold />, <StepAssistant />];

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Subtle background pattern */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
          backgroundSize: "32px 32px",
        }}
      />

      {/* Accent glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-energy-blue/5 rounded-full blur-3xl pointer-events-none" />

      {/* Logo / Brand */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex items-center gap-2.5 mb-8 relative"
      >
        <div className="w-9 h-9 rounded-xl bg-energy-navy flex items-center justify-center">
          <Zap className="w-5 h-5 text-white" />
        </div>
        <span className="text-section-heading text-foreground tracking-tight">
          Energy IDSS
        </span>
      </motion.div>

      {/* Step indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15, duration: 0.4 }}
        className="mb-6 relative"
      >
        <StepIndicator current={step} />
      </motion.div>

      {/* Card */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, duration: 0.5 }}
        className="w-full max-w-lg bg-card rounded-2xl shadow-panel border border-border p-6 sm:p-8 relative"
      >
        <div className="min-h-[340px]">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={step}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              {steps[step]}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-8 pt-5 border-t border-border">
          <button
            onClick={back}
            disabled={step === 0}
            className={`
              flex items-center gap-1.5 px-4 py-2 rounded-xl text-small font-medium transition-all cursor-pointer
              ${
                step === 0
                  ? "text-muted-foreground/40 cursor-default"
                  : "text-foreground hover:bg-muted"
              }
            `}
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>

          {step < 2 ? (
            <button
              onClick={next}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-energy-blue text-white text-small font-medium hover:bg-energy-blue/90 transition-colors cursor-pointer"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={finish}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-energy-navy text-white text-small font-medium hover:bg-energy-navy/90 transition-colors cursor-pointer"
            >
              Get Started
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </motion.div>

      {/* Skip */}
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6, duration: 0.4 }}
        onClick={skip}
        className="mt-4 text-small text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      >
        Skip setup, use defaults
      </motion.button>
    </div>
  );
}
