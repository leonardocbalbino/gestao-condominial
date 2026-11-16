'use client';

import { formatCnpj, isValidCnpj } from '@condo/contracts';
import { useState } from 'react';
import { Field } from './ui';

/**
 * CNPJ com máscara enquanto se digita e conferência dos dígitos verificadores ao sair do
 * campo. A API valida de novo; aqui é só para a pessoa corrigir antes de enviar.
 */
export function CnpjField({ name = 'cnpj', label = 'CNPJ' }: { name?: string; label?: string }) {
  const [value, setValue] = useState('');
  const [touched, setTouched] = useState(false);
  const digits = value.replace(/\D/g, '');
  const error =
    touched && digits.length > 0 && !isValidCnpj(value)
      ? digits.length < 14
        ? 'Faltam números: o CNPJ tem 14.'
        : 'CNPJ inválido: confira os números.'
      : undefined;

  return (
    <Field
      label={label}
      name={name}
      inputMode="numeric"
      autoComplete="off"
      placeholder="00.000.000/0000-00"
      required
      pattern="\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}"
      title="CNPJ com 14 números"
      value={value}
      onChange={(e) => {
        const next = formatCnpj(e.target.value);
        setValue(next);
        e.target.setCustomValidity(
          next.replace(/\D/g, '').length === 14 && !isValidCnpj(next) ? 'CNPJ inválido' : '',
        );
      }}
      onBlur={() => setTouched(true)}
      error={error}
      hint="A máscara entra sozinha."
    />
  );
}
