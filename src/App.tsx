import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { NotFoundPage } from "./components/NotFoundPage";
import { PeopleBrowsePage } from "./features/people/PeopleBrowsePage";
import { PersonDetailPage } from "./features/people/PersonDetailPage";
import { ScanBrowsePage } from "./features/scans/ScanBrowsePage";
import { ScanDetailPage } from "./features/scans/ScanDetailPage";

export default function App() {
  return (
    <BrowserRouter>
      <AppLayout>
        <Routes>
          <Route path="/" element={<Navigate to="/scans" replace />} />
          <Route path="/scans" element={<ScanBrowsePage />} />
          <Route
            path="/scans/:library/:document/:page"
            element={<ScanDetailPage />}
          />
          <Route path="/people" element={<PeopleBrowsePage />} />
          <Route path="/people/view" element={<PersonDetailPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AppLayout>
    </BrowserRouter>
  );
}
