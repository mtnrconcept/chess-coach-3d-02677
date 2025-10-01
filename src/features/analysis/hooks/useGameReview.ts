import { useCallback, useEffect, useMemo } from 'react';
import { useMutation } from '@tanstack/react-query';
import { analysisClient, type AnalyseGameRequest, type AnalyseGameResponse } from '@/services/analysisClient';

export interface UseGameReviewOptions extends AnalyseGameRequest {
  autoStart?: boolean;
}

export interface UseGameReviewResult {
  review: AnalyseGameResponse | null;
  isPending: boolean;
  error: unknown;
  startReview: (override?: Partial<AnalyseGameRequest>) => void;
  reset: () => void;
}

export function useGameReview(options: UseGameReviewOptions): UseGameReviewResult {
  const request = useMemo<AnalyseGameRequest>(
    () => ({
      pgn: options.pgn,
      depth: options.depth,
      multiPv: options.multiPv,
      reviewMode: options.reviewMode,
      accuracyForElo: options.accuracyForElo,
    }),
    [options.accuracyForElo, options.depth, options.multiPv, options.pgn, options.reviewMode],
  );

  const { mutate, data, error, isPending, reset } = useMutation({
    mutationFn: (payload: AnalyseGameRequest) => analysisClient.analyseGame(payload),
  });

  const startReview = useCallback(
    (override?: Partial<AnalyseGameRequest>) => {
      mutate({ ...request, ...override });
    },
    [mutate, request],
  );

  useEffect(() => {
    if (options.autoStart && request.pgn) {
      startReview();
    }
  }, [options.autoStart, request, startReview]);

  return {
    review: data ?? null,
    isPending,
    error,
    startReview,
    reset,
  };
}
