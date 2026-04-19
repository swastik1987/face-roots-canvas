import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { AlertTriangle, RefreshCw } from "lucide-react";

/**
 * Shown on Results / Share when `analyses.is_stale` is true — i.e. the user
 * has re-captured a photo since this analysis was produced, so the results
 * no longer reflect the current face images.
 */
export default function StaleAnalysisBanner() {
  const navigate = useNavigate();

  return (
    <motion.div
      role="status"
      className="w-full max-w-sm mx-auto mt-4 mb-2 px-4"
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 22 }}
    >
      <div className="flex items-start gap-3 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3">
        <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-300" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-amber-100">Results are out of date</p>
          <p className="text-xs text-amber-200/80 mt-0.5">
            Your photos changed since this analysis was run. Re-run to refresh.
          </p>
          <button
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-amber-400/20 hover:bg-amber-400/30 transition-colors px-3 py-1.5 text-xs font-medium text-amber-100"
            onClick={() => navigate("/home")}
          >
            <RefreshCw size={12} />
            Re-run analysis
          </button>
        </div>
      </div>
    </motion.div>
  );
}
