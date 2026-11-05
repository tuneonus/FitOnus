'use client';

import { useState, useEffect, useCallback } from 'react';
import { profilesApi } from '../api';
import type { AdminUserDetail } from '../types';

export function useUserDetail(userId: string | null) {
  const [userDetail, setUserDetail] = useState<AdminUserDetail | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDetail = useCallback(async () => {
    if (!userId) {
      setUserDetail(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const data = await profilesApi.getUserDetail(userId);
      setUserDetail(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load user profile details'
      );
      setUserDetail(null);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      return;
    }

    let isMounted = true;
    profilesApi
      .getUserDetail(userId)
      .then((data) => {
        if (isMounted) {
          setUserDetail(data);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(
            err instanceof Error ? err.message : 'Failed to load user profile details'
          );
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [userId]);

  return {
    userDetail: userId ? userDetail : null,
    isLoading: userId ? isLoading : false,
    error: userId ? error : null,
    refresh: fetchDetail,
  };
}
