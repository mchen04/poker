"use client";

import { feltSurface } from "@/lib/theme";

export default function LoadingScreen({ code }: { code: string }) {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center" style={feltSurface}>
      <div className="text-center">
        <div
          className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"
          role="status"
          aria-label="Connecting"
        />
        <p className="text-gray-400">Connecting to room {code}...</p>
      </div>
    </div>
  );
}
