import React from 'react';
import { Control, Controller, FieldValues, Path } from 'react-hook-form';
import { Input, InputProps } from './input';

interface FormInputProps<TFieldValues extends FieldValues> extends Omit<InputProps, 'value' | 'onChangeText' | 'onBlur'> {
  name: Path<TFieldValues>;
  control: Control<TFieldValues>;
}

export function FormInput<TFieldValues extends FieldValues>({
  name,
  control,
  ...inputProps
}: FormInputProps<TFieldValues>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { onChange, onBlur, value }, fieldState: { error } }) => (
        <Input
          {...inputProps}
          value={value}
          onChangeText={onChange}
          onBlur={onBlur}
          error={error?.message}
        />
      )}
    />
  );
}
