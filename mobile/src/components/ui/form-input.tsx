import React from 'react';
import { type TextInputInstance } from 'react-native';
import { Control, Controller, FieldValues, Path } from 'react-hook-form';
import { Input, InputProps } from './input';

export interface FormInputProps<TFieldValues extends FieldValues> extends Omit<InputProps, 'value' | 'onChangeText' | 'onBlur'> {
  name: Path<TFieldValues>;
  control: Control<TFieldValues>;
}

export const FormInput = React.forwardRef(function FormInput<TFieldValues extends FieldValues>(
  { name, control, ...inputProps }: FormInputProps<TFieldValues>,
  ref: React.ForwardedRef<TextInputInstance>,
) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { onChange, onBlur, value }, fieldState: { error } }) => (
        <Input
          ref={ref}
          {...inputProps}
          value={value}
          onChangeText={onChange}
          onBlur={onBlur}
          error={error?.message}
        />
      )}
    />
  );
}) as <TFieldValues extends FieldValues>(
  props: FormInputProps<TFieldValues> & { ref?: React.Ref<TextInputInstance> },
) => React.ReactElement;
