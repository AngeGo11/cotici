import { WelcomeScreen } from './components/WelcomeScreen';
import { RouterProvider } from 'react-router';
import { router } from './routes';

export default function App() {
  return (
    <>
      <style>
        {`
          @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Outfit:wght@300;400;500;600;700&display=swap');
        `}
      </style>
      <RouterProvider router={router} />
    </>
  );
}