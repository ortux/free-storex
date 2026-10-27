import { useQuery } from '@tanstack/react-query';
import { getUser } from '../api/user';
export function useUser() {
    return useQuery({
        queryKey: ['user'],
        queryFn: getUser,
        retry: false,
    });
}
