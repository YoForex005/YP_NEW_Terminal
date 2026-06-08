"use client";

import { User, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/auth-provider";
import { useState } from "react";
import { VerificationModal } from "@/components/modals/VerificationModal";

export function VerificationBanner() {
  const { user } = useAuth();
  const [isModalOpen, setIsModalOpen] = useState(false);

  // If user is not logged in or is already fully verified, don't show the banner
  if (!user || (user.emailVerified && user.mobileVerified && user.profileVerified)) {
    return null;
  }

  return (
    <>
      <div className="bg-[#FFF9E7] dark:bg-[#2A2410] border-b border-[#FBE8B3] dark:border-[#423712] py-3 px-4 lg:px-8 transition-colors duration-300">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-slate-900 dark:text-[#FBE8B3]">
            <div className="bg-[#FBE8B3] dark:bg-[#423712] p-2 rounded-full">
              <User size={20} className="text-[#B38B00] dark:text-[#FDE08B]" />
            </div>
            <p className="text-sm font-medium">
              Hello, Fill in your account details to make your first deposit
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <Button 
              variant="outline" 
              size="sm" 
              className="bg-white dark:bg-slate-900 border-[#E2E8F0] dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs h-9 px-4 font-semibold"
            >
              Learn more
            </Button>
            <Button 
              onClick={() => setIsModalOpen(true)}
              size="sm" 
              className="bg-[#FFD700] hover:bg-[#E6C200] text-black border-none text-xs h-9 px-4 font-bold shadow-sm flex items-center gap-1"
            >
              Complete profile
              <ChevronRight size={14} />
            </Button>
          </div>
        </div>
      </div>
      
      <VerificationModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
      />
    </>
  );
}
