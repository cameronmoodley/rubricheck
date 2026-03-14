import {
  Autocomplete,
  TextField,
  CircularProgress,
  FormHelperText,
} from "@mui/material";

export type SearchableSelectOption = {
  id: string;
  label: string;
};

type SearchableSelectProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  emptyLabel?: string;
  width?: number | string;
  disabled?: boolean;
  loading?: boolean;
  required?: boolean;
  error?: string;
  allowEmpty?: boolean;
};

const SEARCHABLE_SELECT_WIDTH = 320;

export function SearchableSelect({
  label,
  value,
  onChange,
  options,
  emptyLabel = "Choose...",
  width = SEARCHABLE_SELECT_WIDTH,
  disabled = false,
  loading = false,
  required = false,
  error,
  allowEmpty = true,
}: SearchableSelectProps) {
  const selectedOption = value
    ? options.find((o) => o.id === value) ?? null
    : null;

  const allOptions = allowEmpty
    ? [{ id: "", label: emptyLabel }, ...options]
    : options;

  const displayValue =
    selectedOption ?? (allowEmpty ? { id: "", label: emptyLabel } : null);

  return (
    <>
      <Autocomplete
        sx={{ width: width }}
        options={allOptions}
        getOptionLabel={(opt) => opt.label}
        value={displayValue}
        onChange={(_, newValue) => {
          onChange(newValue?.id ?? "");
        }}
        disabled={disabled}
        isOptionEqualToValue={(opt, val) => opt.id === val.id}
        renderInput={(params) => (
          <TextField
            {...params}
            label={label}
            required={required}
            error={!!error}
            InputProps={{
              ...params.InputProps,
              endAdornment: (
                <>
                  {loading ? (
                    <CircularProgress color="inherit" size={20} />
                  ) : null}
                  {params.InputProps.endAdornment}
                </>
              ),
            }}
          />
        )}
      />
      {error && <FormHelperText error>{error}</FormHelperText>}
    </>
  );
}

