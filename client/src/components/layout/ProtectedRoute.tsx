import { Navigate, useLocation } from 'react-router-dom';
import { UserRole } from '../../types';
import { useAuthStore } from '../../store/auth';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const user = useAuthStore((state) => state.user);
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const needsForcedPasswordChange =
    user?.role === UserRole.ADMIN && !!user?.mustChangePassword;

  if (needsForcedPasswordChange && location.pathname !== '/force-change-password') {
    return <Navigate to="/force-change-password" replace />;
  }

  if (!needsForcedPasswordChange && location.pathname === '/force-change-password') {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
