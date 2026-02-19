import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import KpiCard from "@/components/cards/KpiCard";
import RecommendationCard from "@/components/cards/RecommendationCard";
import type { Recommendation } from "@/stores/useRecommendationStore";

// Mock requestAnimationFrame for animated counter
beforeEach(() => {
  vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((cb) => {
    cb(performance.now() + 1000); // jump to end
    return 0;
  });
});

// ---------------------------------------------------------------------------
// KpiCard
// ---------------------------------------------------------------------------
describe("KpiCard", () => {
  it("renders label, value, and unit", () => {
    render(<KpiCard label="Current Draw" value={2.45} unit="kW" />);
    expect(screen.getByText("Current Draw")).toBeInTheDocument();
    expect(screen.getByText("kW")).toBeInTheDocument();
  });

  it("renders delta when provided", () => {
    render(<KpiCard label="Test" value={10} unit="kWh" delta={5.2} deltaLabel="vs yesterday" />);
    expect(screen.getByText("+5.2%")).toBeInTheDocument();
    expect(screen.getByText("vs yesterday")).toBeInTheDocument();
  });

  it("renders negative delta in green", () => {
    const { container } = render(<KpiCard label="Test" value={10} unit="kWh" delta={-3.1} />);
    const deltaEl = container.querySelector(".text-energy-green");
    expect(deltaEl).toBeInTheDocument();
  });

  it("renders positive delta in red", () => {
    const { container } = render(<KpiCard label="Test" value={10} unit="kWh" delta={5.0} />);
    const deltaEl = container.querySelector(".text-energy-red");
    expect(deltaEl).toBeInTheDocument();
  });

  it("applies danger accent when value >= threshold.danger", () => {
    const { container } = render(
      <KpiCard label="Peak" value={5.0} unit="kW" thresholds={{ warning: 3, danger: 4.5 }} />,
    );
    // Accent stripe uses inline style with the danger colour
    const stripe = container.querySelector("[style]");
    expect(stripe).toBeInTheDocument();
    expect(stripe!.getAttribute("style")).toContain("background-color");
  });

  it("applies warning accent when value >= threshold.warning", () => {
    const { container } = render(
      <KpiCard label="Peak" value={3.5} unit="kW" thresholds={{ warning: 3, danger: 4.5 }} />,
    );
    const stripe = container.querySelector("[style]");
    expect(stripe).toBeInTheDocument();
    expect(stripe!.getAttribute("style")).toContain("background-color");
  });

  it("renders normal accent when below thresholds", () => {
    const { container } = render(
      <KpiCard label="Peak" value={2.0} unit="kW" thresholds={{ warning: 3, danger: 4.5 }} />,
    );
    // Still has accent stripe but with default colour
    const stripe = container.querySelector("[style]");
    expect(stripe).toBeInTheDocument();
  });

  it("calls onClick when clicked", () => {
    const handleClick = vi.fn();
    render(<KpiCard label="Clickable" value={1} unit="kW" onClick={handleClick} />);
    fireEvent.click(screen.getByRole("button"));
    expect(handleClick).toHaveBeenCalledOnce();
  });

  it("button is disabled when no onClick", () => {
    render(<KpiCard label="No Click" value={1} unit="kW" />);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("renders loading skeleton when loading=true", () => {
    const { container } = render(<KpiCard label="Loading" value={0} unit="kW" loading />);
    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
    expect(screen.queryByText("Loading")).not.toBeInTheDocument();
  });

  it("renders icon when provided", () => {
    render(<KpiCard label="Test" value={1} unit="kW" icon={<span data-testid="icon">Z</span>} />);
    expect(screen.getByTestId("icon")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// RecommendationCard
// ---------------------------------------------------------------------------
describe("RecommendationCard", () => {
  const mockReco: Recommendation = {
    id: "reco-1",
    appliance: "Dishwasher",
    applianceIcon: "utensils",
    shiftFrom: "12:00-13:30",
    shiftTo: "02:00-03:30",
    savingsKwh: 1.2,
    savingsCost: 0.18,
    peakReduction: 5.3,
    urgency: "high",
    explanation: "Shifting to off-peak reduces your overall peak demand.",
    status: "pending",
    createdAt: "2026-02-19T10:00:00Z",
  };

  it("renders appliance name and shift description", () => {
    render(<RecommendationCard reco={mockReco} />);
    expect(screen.getByText("Dishwasher")).toBeInTheDocument();
    expect(screen.getByText("12:00-13:30")).toBeInTheDocument();
    expect(screen.getByText("02:00-03:30")).toBeInTheDocument();
  });

  it("renders urgency and status badges", () => {
    render(<RecommendationCard reco={mockReco} />);
    expect(screen.getByText("high")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
  });

  it("renders metrics when not compact", () => {
    render(<RecommendationCard reco={mockReco} />);
    expect(screen.getByText("0.18 CAD")).toBeInTheDocument();
    expect(screen.getByText("1.2 kWh")).toBeInTheDocument();
    expect(screen.getByText("5.3%")).toBeInTheDocument();
  });

  it("hides metrics and explanation in compact mode", () => {
    render(<RecommendationCard reco={mockReco} compact />);
    expect(screen.queryByText("0.18 CAD")).not.toBeInTheDocument();
    expect(screen.queryByText("Shifting to off-peak")).not.toBeInTheDocument();
  });

  it("shows action buttons when pending", () => {
    const onAccept = vi.fn();
    const onReject = vi.fn();
    const onSnooze = vi.fn();
    render(
      <RecommendationCard reco={mockReco} onAccept={onAccept} onReject={onReject} onSnooze={onSnooze} />,
    );
    expect(screen.getByText("Accept")).toBeInTheDocument();
    expect(screen.getByText("Snooze")).toBeInTheDocument();
    expect(screen.getByText("Reject")).toBeInTheDocument();
  });

  it("hides action buttons when not pending", () => {
    const acceptedReco = { ...mockReco, status: "accepted" as const };
    render(<RecommendationCard reco={acceptedReco} onAccept={vi.fn()} />);
    expect(screen.queryByText("Accept")).not.toBeInTheDocument();
  });

  it("calls onAccept with reco id when Accept clicked", () => {
    const onAccept = vi.fn();
    render(<RecommendationCard reco={mockReco} onAccept={onAccept} />);
    fireEvent.click(screen.getByText("Accept"));
    expect(onAccept).toHaveBeenCalledWith("reco-1");
  });

  it("calls onReject with reco id when Reject clicked", () => {
    const onReject = vi.fn();
    render(<RecommendationCard reco={mockReco} onReject={onReject} />);
    fireEvent.click(screen.getByText("Reject"));
    expect(onReject).toHaveBeenCalledWith("reco-1");
  });

  it("calls onSnooze with reco id when Snooze clicked", () => {
    const onSnooze = vi.fn();
    render(<RecommendationCard reco={mockReco} onSnooze={onSnooze} />);
    fireEvent.click(screen.getByText("Snooze"));
    expect(onSnooze).toHaveBeenCalledWith("reco-1");
  });

  it("renders explanation text", () => {
    render(<RecommendationCard reco={mockReco} />);
    expect(screen.getByText("Shifting to off-peak reduces your overall peak demand.")).toBeInTheDocument();
  });

  it("shows Accepted badge for accepted recommendations", () => {
    const acceptedReco = { ...mockReco, status: "accepted" as const };
    render(<RecommendationCard reco={acceptedReco} />);
    expect(screen.getByText("Accepted")).toBeInTheDocument();
  });
});
