'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTheme } from 'next-themes';
import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';

// Use Giphy public beta demo key for development
const GIPHY_API_KEY = 'sXpGFDGZs0Dv1mmNFvYaGUvYwKX0PWIh';
const STICKER_PAGE_SIZE = 20;

interface Sticker {
    id: string;
    title: string;
    alt_text?: string;
    images: {
        fixed_width: {
            url: string;
            webp?: string;
        };
    };
}

interface StickerResponse {
    data: Sticker[];
    pagination: {
        count: number;
        offset: number;
        total_count: number;
    };
}

async function fetchStickers(searchQuery: string, offset: number): Promise<StickerResponse> {
    const query = searchQuery.trim();
    const endpoint = query ? 'search' : 'trending';
    const params = new URLSearchParams({
        api_key: GIPHY_API_KEY,
        limit: String(STICKER_PAGE_SIZE),
        offset: String(offset),
        rating: 'g',
    });

    if (query) params.set('q', query);

    const response = await fetch(`https://api.giphy.com/v1/stickers/${endpoint}?${params}`);
    if (!response.ok) throw new Error(`Giphy request failed with status ${response.status}`);

    return response.json() as Promise<StickerResponse>;
}

function StickerGrid({
    searchQuery,
    onSelect,
}: {
    searchQuery: string;
    onSelect: (sticker: Sticker) => void;
}) {
    const [stickers, setStickers] = useState<Sticker[]>([]);
    const [nextOffset, setNextOffset] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const requestVersion = useRef(0);

    const fetchPage = useCallback(
        (offset: number) => fetchStickers(searchQuery, offset),
        [searchQuery],
    );

    useEffect(() => {
        const version = ++requestVersion.current;
        const debounceTimer = window.setTimeout(async () => {
            setIsLoading(true);
            setError(null);

            try {
                const result = await fetchPage(0);
                if (requestVersion.current !== version) return;

                const offset = result.pagination.offset + result.pagination.count;
                setStickers(result.data);
                setNextOffset(offset);
                setHasMore(offset < result.pagination.total_count);
            } catch {
                if (requestVersion.current === version) {
                    setStickers([]);
                    setError('Unable to load stickers. Please try again.');
                }
            } finally {
                if (requestVersion.current === version) setIsLoading(false);
            }
        }, searchQuery ? 250 : 0);

        return () => {
            window.clearTimeout(debounceTimer);
            requestVersion.current += 1;
        };
    }, [fetchPage, searchQuery]);

    const loadMore = async () => {
        if (isLoading || !hasMore) return;

        const version = requestVersion.current;
        setIsLoading(true);
        setError(null);

        try {
            const result = await fetchPage(nextOffset);
            if (requestVersion.current !== version) return;

            const offset = result.pagination.offset + result.pagination.count;
            setStickers((current) => [...current, ...result.data]);
            setNextOffset(offset);
            setHasMore(offset < result.pagination.total_count);
        } catch {
            if (requestVersion.current === version) {
                setError('Unable to load more stickers. Please try again.');
            }
        } finally {
            if (requestVersion.current === version) setIsLoading(false);
        }
    };

    return (
        <div className="grid grid-cols-3 gap-1.5">
            {stickers.map((sticker) => {
                const image = sticker.images.fixed_width;
                const imageUrl = image.webp || image.url;

                return (
                    <button
                        key={sticker.id}
                        type="button"
                        onClick={() => onSelect(sticker)}
                        className="overflow-hidden rounded-[4px] bg-accent hover:ring-1 hover:ring-primary focus:outline-none focus:ring-1 focus:ring-primary"
                        title={sticker.title || 'Select sticker'}
                    >
                        {/* The Giphy CDN serves animated WebP files, which next/image does not optimize. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={imageUrl}
                            alt={sticker.alt_text || sticker.title || 'Giphy sticker'}
                            loading="lazy"
                            className="aspect-square h-full w-full object-contain"
                        />
                    </button>
                );
            })}

            {error && <p className="col-span-3 py-3 text-center text-xs text-destructive">{error}</p>}
            {!error && !isLoading && stickers.length === 0 && (
                <p className="col-span-3 py-3 text-center text-xs text-muted-foreground">No stickers found.</p>
            )}
            {isLoading && (
                <p className="col-span-3 py-3 text-center text-xs text-muted-foreground">Loading stickers…</p>
            )}
            {!isLoading && hasMore && stickers.length > 0 && (
                <button
                    type="button"
                    onClick={loadMore}
                    className="col-span-3 rounded-[4px] border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                    Load more
                </button>
            )}
        </div>
    );
}

export const EmojiStickerPicker = ({ onSelect }: { onSelect: (type: 'emoji'|'sticker'|'icon', data: any) => void }) => {
    const [activeTab, setActiveTab] = useState<'Emojis' | 'Stickers' | 'Icons'>('Emojis');
    const [searchQuery, setSearchQuery] = useState('');
    const { resolvedTheme } = useTheme();

    return (
        <div className="flex flex-col h-full w-full bg-popover rounded-[6px] overflow-hidden">
            {/* Content Body */}
            <div className="flex-1 overflow-hidden relative">
                {activeTab === 'Emojis' && (
                    <div className="absolute inset-0 w-full h-full emoji-mart-container custom-scrollbar">
                        <Picker 
                            data={data} 
                            onEmojiSelect={(emoji: any) => onSelect('emoji', emoji)}
                            theme={resolvedTheme === 'light' ? 'light' : 'dark'}
                            set="native" // Use OS-level native emojis instead of CDN sprites to fix CORS/blocked image loading
                            showPreview={false}
                            showSkinTones={false}
                            perLine={8}
                            navPosition="top"
                            style={{ border: 'none' }}
                        />
                    </div>
                )}
                
                {activeTab === 'Stickers' && (
                    <div className="absolute inset-0 w-full h-full flex flex-col p-2">
                        <input 
                            type="text" 
                            placeholder="Search stickers..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-accent border border-border rounded-[4px] px-3 py-1.5 text-[13px] text-foreground focus:outline-none focus:border-primary mb-2 flex-shrink-0"
                        />
                        <div className="flex-1 overflow-y-auto custom-scrollbar">
                            <StickerGrid
                                searchQuery={searchQuery}
                                onSelect={(sticker) => onSelect('sticker', sticker)}
                            />
                        </div>
                    </div>
                )}

                {activeTab === 'Icons' && (
                    <div className="absolute inset-0 w-full h-full flex items-center justify-center p-4 text-center">
                        <p className="text-muted-foreground text-[13px]">Standard geometric chart icons are mapped directly into your toolbar.</p>
                    </div>
                )}
            </div>

            {/* Bottom tab bar matching terminal charting parity */}
            <div className="flex items-center justify-center gap-6 px-4 py-3 border-t border-border bg-card flex-shrink-0 h-[40px]">
                <button 
                    onClick={() => setActiveTab('Emojis')}
                    className={`text-[13px] font-medium transition-colors pb-1 translate-y-[2px] ${activeTab === 'Emojis' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'}`}
                >
                    Emojis
                </button>
                <button 
                    onClick={() => setActiveTab('Stickers')}
                    className={`text-[13px] font-medium transition-colors pb-1 translate-y-[2px] ${activeTab === 'Stickers' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'}`}
                >
                    Stickers
                </button>
                <button 
                    onClick={() => setActiveTab('Icons')}
                    className={`text-[13px] font-medium transition-colors pb-1 translate-y-[2px] ${activeTab === 'Icons' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'}`}
                >
                    Icons
                </button>
            </div>

            <style dangerouslySetInnerHTML={{__html: `
                .emoji-mart-container em-emoji-picker {
                    height: 100% !important;
                    width: 100% !important;
                }
            `}} />
        </div>
    );
};
