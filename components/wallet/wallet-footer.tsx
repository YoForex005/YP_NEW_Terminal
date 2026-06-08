import Link from "next/link";

export function WalletFooter() {
    return (
        <div className="mt-16 pt-8 border-t flex flex-col md:flex-row gap-8 justify-between text-[10px] leading-tight text-muted-foreground/60 w-full mt-auto">
            <div className="space-y-4 max-w-2xl">
                <p>
                    FxTrusts Limited is registered and regulated by the Financial Services Commission under
                    registration number 700271 and has its registered office at Law Partners House, Kumul Highway, Port Vila, Vanuatu.
                </p>
                <p>This website is operated by FxTrusts Limited.</p>
                <p>The entity above is duly authorized to operate under the FxTrusts brand and trademarks.</p>
                <p>
                    Risk Warning: Online Forex/CFDs are complex instruments and come with a high risk of losing money rapidly due to leverage.
                    You should consider whether you understand how CFDs work and whether you can afford to take the high risk of losing your 
                    money. Under no circumstances shall FxTrusts have any liability to any person or entity for any loss or damage in whole or part 
                    caused by, resulting from, or relating to any financial activity. <Link href="#" className="text-primary hover:underline">Learn more</Link>
                </p>
                <p>The information on this website may only be copied with the express written permission of FxTrusts.</p>
                <p>
                    FxTrusts complies with the Payment Card Industry Data Security Standard (PCI DSS) to ensure your security and privacy. We
                    conduct regular vulnerability scans and penetration tests in accordance with the PCI DSS requirements for our business model.
                </p>
            </div>

            <div className="space-y-2 min-w-[200px] flex flex-col">
                <Link href="#" className="hover:text-primary transition-colors hover:underline">Client Agreement</Link>
                <Link href="#" className="hover:text-primary transition-colors hover:underline">General Business Terms</Link>
                <Link href="#" className="hover:text-primary transition-colors hover:underline">Partnership Agreement</Link>
                <Link href="#" className="hover:text-primary transition-colors hover:underline">Bonus terms and Conditions</Link>
                <Link href="#" className="hover:text-primary transition-colors hover:underline">Complaints Procedure for Clients</Link>
                <Link href="#" className="hover:text-primary transition-colors hover:underline">Risk disclosure</Link>
                <Link href="#" className="hover:text-primary transition-colors hover:underline">Preventing money laundering</Link>
                <Link href="#" className="hover:text-primary transition-colors hover:underline">Security instructions</Link>
                <Link href="#" className="hover:text-primary transition-colors hover:underline">Privacy Agreement</Link>
                <Link href="#" className="hover:text-primary transition-colors hover:underline">Key Facts Statement</Link>
                <Link href="#" className="hover:text-primary transition-colors hover:underline">Contact</Link>
                
                <p className="pt-4 opacity-50">© 2008 - 2026. FxTrusts</p>
            </div>
        </div>
    );
}
