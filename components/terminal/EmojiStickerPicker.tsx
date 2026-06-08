import React, { useState } from 'react';
import { useTheme } from 'next-themes';
import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';
import { Grid } from '@giphy/react-components';
import { GiphyFetch } from '@giphy/js-fetch-api';

// Use Giphy public beta demo key for development
const gf = new GiphyFetch('sXpGFDGZs0Dv1mmNFvYaGUvYwKX0PWIh');

export const EmojiStickerPicker = ({ onSelect }: { onSelect: (type: 'emoji'|'sticker'|'icon', data: any) => void }) => {
    const [activeTab, setActiveTab] = useState<'Emojis' | 'Stickers' | 'Icons'>('Emojis');
    const [searchQuery, setSearchQuery] = useState('');
    const { resolvedTheme } = useTheme();

    const fetchGifs = (offset: number) => {
        if (searchQuery) {
            return gf.search(searchQuery, { offset, limit: 20, type: 'stickers' });
        }
        return gf.trending({ offset, limit: 20, type: 'stickers' });
    };

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
                            <Grid 
                                key={searchQuery} // Forces remount on search 
                                width={290} 
                                columns={3} 
                                fetchGifs={fetchGifs} 
                                onGifClick={(gif, e) => {
                                    e.preventDefault();
                                    onSelect('sticker', gif);
                                }}
                                noLink={true}
                                hideAttribution={true}
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
