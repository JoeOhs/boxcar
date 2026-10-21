import { Select } from "@/components/ui/select";

/**
 * The model dropdown used everywhere the app asks for a model. The options are the
 * models prefilled for the provider in use; the author picks one, there is no
 * free-text entry. A model already saved that is no longer in the list stays
 * visible so the choice is never silently lost.
 */
export function ModelSelect({
  id,
  options,
  value,
  onChange,
  className,
  label,
}: {
  id: string;
  options: string[];
  value: string;
  onChange: (model: string) => void;
  className?: string;
  /** Accessible name, for places without a visible label beside the dropdown. */
  label?: string;
}) {
  const list = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <Select id={id} aria-label={label} className={className} value={value} onChange={(e) => onChange(e.target.value)}>
      {list.map((model) => (
        <option key={model} value={model}>
          {model}
        </option>
      ))}
    </Select>
  );
}
