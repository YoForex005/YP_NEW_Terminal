import * as React from "react";
import { SVGProps } from "react";

export function BitcoinIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" {...props}>
      <circle cx="16" cy="16" r="16" fill="#F7931A" />
      <path fill="#FFF" d="M22.9 14.8c1.3-1.1 2-2.8 1.8-4.5-.4-3.5-3.3-4.3-6.5-4.3h-4.3v-3h-2.5v3h-2v-3h-2.4v3h-3.6v2.5h1.9c.7 0 1.2.6 1.2 1.2v10.5c0 .7-.6 1.2-1.2 1.2h-1.9v2.5h3.6v3h2.4v-3h2v3h2.5v-3h2.2c7.6 0 8.7-4.6 7-8.2-1-.7-2-1-3.2-1.1zm-6-6h2.7c3 0 3.7 3.3.1 3.5h-2.8v-3.5zm3.5 10.7h-3.5v-3.8h3.3c3.7.1 4.5 3.8.2 3.8z" />
    </svg>
  );
}

export function EthereumIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" {...props}>
      <path fill="#8A92B2" d="M15.9 1.5l-8.5 13.5 8.5 4.8 8.6-4.8L15.9 1.5z" />
      <path fill="#62688F" d="M15.9 20.8l-8.5-4.7 8.5 11.5 8.6-11.5-8.6 4.7z" />
    </svg>
  );
}

export function TronIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" {...props}>
      <path fill="#FF060A" d="M3.2 16.5l11.6-11 3.3 12.3-14.9-1.3zm15.4-12.2l-3.3 14h2.1l11.7-14v-2.1L18.6 4.3zm-14 13.4l14.1 11v-11H4.6zm15.5 11l6.7-11h-6.7v11z" />
    </svg>
  );
}

// Network badge helpers
function Erc20Badge() {
  return (
    <g transform="translate(18, 18)">
      <circle cx="7" cy="7" r="7" fill="#FFF" />
      <g transform="translate(2.5, 2.5) scale(0.28)">
         <path fill="#8A92B2" d="M15.9 1.5l-8.5 13.5 8.5 4.8 8.6-4.8L15.9 1.5z" />
         <path fill="#62688F" d="M15.9 20.8l-8.5-4.7 8.5 11.5 8.6-11.5-8.6 4.7z" />
      </g>
    </g>
  );
}

function Trc20Badge() {
  return (
    <g transform="translate(18, 18)">
      <circle cx="7" cy="7" r="7" fill="#FFF" />
      <circle cx="7" cy="7" r="5" fill="#FF060A" />
      <path fill="#FFF" transform="translate(2.2, 2.2) scale(0.3)" d="M3.2 16.5l11.6-11 3.3 12.3-14.9-1.3zm15.4-12.2l-3.3 14h2.1l11.7-14v-2.1L18.6 4.3zm-14 13.4l14.1 11v-11H4.6zm15.5 11l6.7-11h-6.7v11z" />
    </g>
  );
}

function Bep20Badge() {
  return (
    <g transform="translate(18, 18)">
      <circle cx="7" cy="7" r="7" fill="#FFF" />
      <circle cx="7" cy="7" r="5" fill="#F3BA2F" />
      {/* Simplified Binance icon inside */}
      <path fill="#FFF" d="M7 3 l 4 4 l -4 4 l -4 -4 z M7 5 l 2 2 l -2 2 l -2 -2 z" />
    </g>
  );
}

// Raw components (colored)
export function TetherIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" {...props}>
      <circle cx="16" cy="16" r="16" fill="#26A17B" />
      <path fill="#FFF" d="M16 2.5c-7.5 0-13.5 6-13.5 13.5s6 13.5 13.5 13.5 13.5-6 13.5-13.5S23.5 2.5 16 2.5zm5.5 10.8c0 1.9-5.5 3.5-5.5 3.5s-5.5-1.6-5.5-3.5v-2.3h4.1v8l1.4-1.4 1.4 1.4v-8h4.1v2.3z" fillRule="evenodd" clipRule="evenodd" />
    </svg>
  );
}

// Composed Badged Components
export function TetherErc20Icon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" {...props}>
      <TetherIcon width="100%" height="100%" />
      <Erc20Badge />
    </svg>
  );
}

export function TetherTrc20Icon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" {...props}>
      <TetherIcon width="100%" height="100%" />
      <Trc20Badge />
    </svg>
  );
}

export function TetherBep20Icon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" {...props}>
      <TetherIcon width="100%" height="100%" />
      <Bep20Badge />
    </svg>
  );
}

export function UsdcIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" {...props}>
      <circle cx="16" cy="16" r="16" fill="#2775CA" />
      <path fill="#FFF" d="M16 2.5c-7.5 0-13.5 6-13.5 13.5s6 13.5 13.5 13.5 13.5-6 13.5-13.5S23.5 2.5 16 2.5zm4 17.5c-1 1.7-2.8 2.5-4.5 2.5v1.8h-1.5v-1.8c-2.4-.2-4.1-1.6-4.9-3.7l2-.9c.6 1.4 1.8 2.2 3.1 2.3v-3.7c-2.7-.6-4.3-1.8-4.3-4.1 0-1.8 1.4-3.1 3.5-3.4v-1.6h1.6v1.6c1.7.2 3 1.1 3.7 2.6l-1.9 1c-.4-1.1-1.4-1.6-2.4-1.8v3.6c2.8.7 4.5 2 4.5 4.3 0 .4-.1.9-.3 1.3zm-5-8.5c-1.1.2-1.7.8-1.7 1.6 0 .9.8 1.4 2.1 1.8v-3.3c-.2-.1-.3-.1-.4-.1zm1.6 6c1.3-.2 2.1-.8 2.1-1.8 0-.9-.7-1.5-2.1-1.9v3.7c0-.1 0 0 0 0z" fillRule="evenodd" clipRule="evenodd" />
    </svg>
  );
}

export function UsdcErc20Icon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" {...props}>
      <UsdcIcon width="100%" height="100%" />
      <Erc20Badge />
    </svg>
  );
}

export function UsdcBep20Icon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" {...props}>
      <UsdcIcon width="100%" height="100%" />
      <Bep20Badge />
    </svg>
  );
}
