export default function StreamingIndicator() {
  return (
    <div className="flex items-center gap-1.5 px-3 py-2">
      <span className="w-1.5 h-1.5 rounded-full bg-energy-blue animate-bounce [animation-delay:0ms]" />
      <span className="w-1.5 h-1.5 rounded-full bg-energy-blue animate-bounce [animation-delay:150ms]" />
      <span className="w-1.5 h-1.5 rounded-full bg-energy-blue animate-bounce [animation-delay:300ms]" />
    </div>
  );
}
