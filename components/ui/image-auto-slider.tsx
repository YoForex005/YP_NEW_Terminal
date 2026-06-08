'use client';

import React from 'react';
import { cn } from '@/lib/utils';

const FINANCE_IMAGES = [
  "https://images.unsplash.com/photo-1518495973542-4542c06a5843?q=80&w=1974&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
  "https://images.unsplash.com/photo-1472396961693-142e6e269027?q=80&w=2152&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
  "https://images.unsplash.com/photo-1505142468610-359e7d316be0?q=80&w=2126&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
  "https://images.unsplash.com/photo-1482881497185-d4a9ddbe4151?q=80&w=1965&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
  "https://plus.unsplash.com/premium_photo-1673264933212-d78737f38e48?q=80&w=1974&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
  "https://plus.unsplash.com/premium_photo-1711434824963-ca894373272e?q=80&w=2030&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
  "https://plus.unsplash.com/premium_photo-1675705721263-0bbeec261c49?q=80&w=1940&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
  "https://images.unsplash.com/photo-1524799526615-766a9833dec0?q=80&w=1935&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
];

interface ImageAutoSliderProps {
  /** Article's primary image placed first in the strip */
  primaryImage?: string;
  /** Strip height in px (default: 192) */
  height?: number;
  /** Scroll animation duration in seconds (default: 20) */
  speed?: number;
  className?: string;
}

export function ImageAutoSlider({
  primaryImage,
  height = 192,
  speed = 20,
  className,
}: ImageAutoSliderProps) {
  const images = primaryImage
    ? [primaryImage, ...FINANCE_IMAGES.slice(0, 7)]
    : FINANCE_IMAGES;
  const duplicated = [...images, ...images];

  const animId = `isl-${speed}`;

  return (
    <>
      <style>{`
        @keyframes ${animId} {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .${animId}-track {
          animation: ${animId} ${speed}s linear infinite;
        }
        .isl-item {
          transition: transform 0.3s ease, filter 0.3s ease;
        }
        .isl-item:hover {
          transform: scale(1.05);
          filter: brightness(1.1);
        }
      `}</style>

      <div
        className={cn('relative overflow-hidden w-full', className)}
        style={{ height: `${height}px` }}
      >
        {/* Soft fade masks on both sides */}
        <div
          className="absolute inset-0 z-10 pointer-events-none"
          style={{
            maskImage: 'linear-gradient(90deg, transparent 0%, black 12%, black 88%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(90deg, transparent 0%, black 12%, black 88%, transparent 100%)',
          }}
        />

        <div className={`${animId}-track flex gap-3 w-max h-full items-center px-3`}>
          {duplicated.map((src, i) => (
            <div
              key={i}
              className="isl-item flex-shrink-0 h-full rounded-lg overflow-hidden shadow-md"
              style={{ aspectRatio: '4 / 3' }}
            >
              <img
                src={src}
                alt=""
                className="w-full h-full object-cover"
                loading="lazy"
                onError={(e) => {
                  (e.target as HTMLImageElement).src =
                    'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=400&h=300&fit=crop';
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// Original full-page component kept for standalone use
export const Component = () => {
  const images = FINANCE_IMAGES;
  const duplicatedImages = [...images, ...images];

  return (
    <>
      <style>{`
        html, body { margin: 0; padding: 0; overflow-x: hidden; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
        @keyframes scroll-right { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        .infinite-scroll { animation: scroll-right 20s linear infinite; }
        .scroll-container {
          mask: linear-gradient(90deg, transparent 0%, black 10%, black 90%, transparent 100%);
          -webkit-mask: linear-gradient(90deg, transparent 0%, black 10%, black 90%, transparent 100%);
        }
        .image-item { transition: transform 0.3s ease, filter 0.3s ease; }
        .image-item:hover { transform: scale(1.05); filter: brightness(1.1); }
      `}</style>
      <div className="w-full min-h-screen bg-black relative overflow-hidden flex items-center justify-center">
        <div className="absolute inset-0 bg-gradient-to-b from-black via-black/90 to-black z-0" />
        <div className="relative z-10 w-full flex items-center justify-center py-8">
          <div className="scroll-container w-full max-w-6xl">
            <div className="infinite-scroll flex gap-6 w-max">
              {duplicatedImages.map((image, index) => (
                <div key={index} className="image-item flex-shrink-0 w-48 h-48 md:w-64 md:h-64 lg:w-80 lg:h-80 rounded-xl overflow-hidden shadow-2xl">
                  <img src={image} alt={`Gallery image ${(index % images.length) + 1}`} className="w-full h-full object-cover" loading="lazy" />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-black to-transparent z-20" />
      </div>
    </>
  );
};
