import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  addWatchlistCard,
  addWatchlistSet,
  defaultWatchlistID,
  getWatchlistMemberships,
  removeWatchlistCard,
  removeWatchlistSet,
  type WatchlistCardTarget,
  type WatchlistSetTarget,
} from '@/lib/api';

const membershipQueryKey = ['watchlist', defaultWatchlistID, 'memberships'] as const;

export function useWatchlistCardMembership(target: WatchlistCardTarget) {
  const queryClient = useQueryClient();
  const membershipsQuery = useQuery({
    queryKey: membershipQueryKey,
    queryFn: ({ signal }) => getWatchlistMemberships(defaultWatchlistID, signal),
  });
  const membership = membershipsQuery.data?.cards.find(
    (item) =>
      item.cardId === target.cardId &&
      item.edition === target.edition &&
      item.finish === target.finish &&
      item.language === target.language,
  );
  const mutation = useMutation({
    mutationFn: async () => {
      if (membership) {
        await removeWatchlistCard(membership.itemId, defaultWatchlistID);
      } else {
        await addWatchlistCard(target, defaultWatchlistID);
      }
    },
    onSuccess: () => invalidateWatchlist(queryClient),
  });

  return {
    error: membershipsQuery.isError || mutation.isError,
    loading: membershipsQuery.isPending || mutation.isPending,
    toggle: mutation.mutate,
    watched: membership !== undefined,
  };
}

export function useWatchlistSetMembership(target: WatchlistSetTarget) {
  const queryClient = useQueryClient();
  const membershipsQuery = useQuery({
    queryKey: membershipQueryKey,
    queryFn: ({ signal }) => getWatchlistMemberships(defaultWatchlistID, signal),
  });
  const membership = membershipsQuery.data?.sets.find(
    (item) => item.setId === target.setId && item.edition === target.edition,
  );
  const mutation = useMutation({
    mutationFn: async () => {
      if (membership) {
        await removeWatchlistSet(membership.itemId, defaultWatchlistID);
      } else {
        await addWatchlistSet(target, defaultWatchlistID);
      }
    },
    onSuccess: () => invalidateWatchlist(queryClient),
  });

  return {
    error: membershipsQuery.isError || mutation.isError,
    loading: membershipsQuery.isPending || mutation.isPending,
    toggle: mutation.mutate,
    watched: membership !== undefined,
  };
}

export async function invalidateWatchlist(
  queryClient: ReturnType<typeof useQueryClient>,
): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: ['watchlist', defaultWatchlistID] });
}
