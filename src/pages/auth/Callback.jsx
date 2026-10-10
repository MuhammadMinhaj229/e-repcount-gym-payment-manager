import { Navigate } from 'react-router-dom';

export default function Callback() {
  return <Navigate to="/login" replace />;
}
