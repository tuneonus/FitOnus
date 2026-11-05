import React from 'react';

export function UserMessage({ text }: {text: string;}) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[82%] rounded-3xl rounded-br-lg bg-ink px-4 py-2.5 text-[15px] leading-relaxed text-bg">{text}</p>
    </div>);

}