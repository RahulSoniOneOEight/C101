import { Input, Label, Select, Text, Textarea } from "@medusajs/ui";
import type { ContentField } from "./content-model";

export function ContentFieldInput({
  field,
  value,
  onChange,
}: {
  field: ContentField;
  value: string;
  onChange: (value: string) => void;
}) {
  const inputId = `content-field-${field.name}`;
  const descriptionId = field.description ? `${inputId}-description` : undefined;

  return (
    <div className="flex flex-col gap-y-2">
      <div>
        <Label htmlFor={inputId} size="small" weight="plus">
          {field.label}{field.required ? " *" : ""}
        </Label>
        {field.description ? (
          <Text id={descriptionId} size="xsmall" className="text-ui-fg-subtle">
            {field.description}
          </Text>
        ) : null}
      </div>
      {field.type === "enum" ? (
        <Select value={value} onValueChange={onChange}>
          <Select.Trigger id={inputId} aria-describedby={descriptionId} data-testid={inputId}>
            <Select.Value placeholder={`Select ${field.label.toLowerCase()}`} />
          </Select.Trigger>
          <Select.Content>
            {(field.options ?? []).map((option) => (
              <Select.Item key={option} value={option}>
                {option}
              </Select.Item>
            ))}
          </Select.Content>
        </Select>
      ) : field.type === "text" || field.type === "richtext" || field.type === "json" ? (
        <Textarea
          id={inputId}
          aria-describedby={descriptionId}
          data-testid={inputId}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={field.type === "json" ? 10 : 5}
          placeholder={field.type === "json" ? "Enter valid structured JSON" : undefined}
        />
      ) : (
        <Input
          id={inputId}
          aria-describedby={descriptionId}
          data-testid={inputId}
          type={
            field.type === "datetime"
              ? "datetime-local"
              : field.type === "integer"
                ? "number"
                : field.type === "url"
                  ? "url"
                  : "text"
          }
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </div>
  );
}
