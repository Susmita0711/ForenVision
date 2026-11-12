import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';

// Layouts
import { MainLayout } from './layouts/MainLayout';
import { AuthLayout } from './layouts/AuthLayout';

// Common Components
import { ProtectedRoute } from './components/common/ProtectedRoute';

// Pages
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { DashboardPage } from './pages/DashboardPage';
import { CasesPage } from './pages/CasesPage';
import { CaseDetailsPage } from './pages/CaseDetailsPage';
import { EvidenceVaultPage } from './pages/EvidenceVaultPage';
import { EvidenceDetailsPage } from './pages/EvidenceDetailsPage';
import { ImageAnalysisPage } from './pages/ImageAnalysisPage';
import { ObjectDetectionPage } from './pages/ObjectDetectionPage';
import { FingerprintAnalysisPage } from './pages/FingerprintAnalysisPage';
import { FaceAnalysisPage } from './pages/FaceAnalysisPage';
import { SketchAnalysisPage } from './pages/SketchAnalysisPage';
import { ChainOfCustodyPage } from './pages/ChainOfCustodyPage';
import { ReportsPage } from './pages/ReportsPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { UserManagementPage } from './pages/UserManagementPage';
import { SettingsPage } from './pages/SettingsPage';
import { AuditLogsPage } from './pages/AuditLogsPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { HomePage } from './pages/HomePage'; // Preserved Step 1 Gateway Health

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <NotificationProvider>
        <Router>
          <Routes>
            {/* Public Authentication Routes */}
            <Route element={<AuthLayout />}>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
            </Route>

            {/* Main Authenticated Application Shell */}
            <Route
              element={
                <ProtectedRoute>
                  <MainLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/cases" element={<CasesPage />} />
              <Route path="/cases/:id" element={<CaseDetailsPage />} />
              <Route path="/evidence" element={<EvidenceVaultPage />} />
              <Route path="/evidence/:id" element={<EvidenceDetailsPage />} />
              <Route path="/analysis/image" element={<ImageAnalysisPage />} />
              <Route path="/analysis/detection" element={<ObjectDetectionPage />} />
              <Route path="/analysis/fingerprint" element={<FingerprintAnalysisPage />} />
              <Route path="/analysis/face" element={<FaceAnalysisPage />} />
              <Route path="/analysis/sketch" element={<SketchAnalysisPage />} />
              <Route path="/chain-of-custody" element={<ChainOfCustodyPage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/analytics" element={<AnalyticsPage />} />
              <Route
                path="/users"
                element={
                  <ProtectedRoute allowedRoles={['admin']}>
                    <UserManagementPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/settings"
                element={
                  <ProtectedRoute allowedRoles={['admin']}>
                    <SettingsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/audit-logs"
                element={
                  <ProtectedRoute allowedRoles={['admin']}>
                    <AuditLogsPage />
                  </ProtectedRoute>
                }
              />
              <Route path="/system-overview" element={<HomePage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </Router>
      </NotificationProvider>
    </AuthProvider>
  );
};

export default App;
