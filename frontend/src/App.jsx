import { Navigate, Route, Routes } from "react-router-dom";
import { AppProvider, useApp } from "./context/AppContext.jsx";
import Navbar from "./components/Navbar.jsx";
import Toast from "./components/Toast.jsx";
import Login from "./pages/Login.jsx";
import Workspace from "./pages/Workspace.jsx";
import Admin from "./pages/Admin.jsx";
import Benchmark from "./pages/Benchmark.jsx";

function Shell() {
  const { isAuthed, isAdmin } = useApp();

  if (!isAuthed) {
    return (
      <>
        <Login />
        <Toast />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-canvas">
      <Navbar />
      <main>
        <Routes>
          <Route path="/" element={<Navigate to="/workspace" replace />} />
          <Route path="/workspace" element={<Workspace />} />
          <Route path="/benchmark" element={<Benchmark />} />
          <Route
            path="/admin"
            element={isAdmin ? <Admin /> : <Navigate to="/workspace" replace />}
          />
          <Route path="*" element={<Navigate to="/workspace" replace />} />
        </Routes>
      </main>
      <Toast />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
