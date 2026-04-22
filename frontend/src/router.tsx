import { createBrowserRouter } from 'react-router';
import { App } from './App';
import { HomePage } from './pages/HomePage';
import { EventsListPage } from './pages/EventsListPage';
import { EventDetailPage } from './pages/EventDetailPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { PaymentPage } from './pages/PaymentPage';
import { MyTicketsPage } from './pages/MyTicketsPage';
import { TicketDetailPage } from './pages/TicketDetailPage';
import { ProfilePage } from './pages/ProfilePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ProtectedRoute } from './components/ProtectedRoute';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'events', element: <EventsListPage /> },
      { path: 'events/:id', element: <EventDetailPage /> },
      { path: 'auth/login', element: <LoginPage /> },
      { path: 'auth/register', element: <RegisterPage /> },
      {
        path: 'checkout/:reservationId',
        element: (
          <ProtectedRoute>
            <CheckoutPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'payment/:reservationId',
        element: (
          <ProtectedRoute>
            <PaymentPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'tickets',
        element: (
          <ProtectedRoute>
            <MyTicketsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'tickets/:id',
        element: (
          <ProtectedRoute>
            <TicketDetailPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'profile',
        element: (
          <ProtectedRoute>
            <ProfilePage />
          </ProtectedRoute>
        ),
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
