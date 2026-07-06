import { lazy } from "react";
import {
  createBrowserRouter,
  createRoutesFromElements,
  Outlet,
  Route,
} from "react-router-dom";
import { ProtectedTeamRoute } from "@/components/authorization/teamGuard";
import { ProtectedAdminRoute } from "./components/authorization/authAdminGuard";
import { ProtectedRoute } from "./components/authorization/authGuard";
import { ProtectedLoginRoute } from "./components/authorization/authLoginGuard";
import { AuthSettingsGuard } from "./components/authorization/authSettingsGuard";
import { PlaygroundAuthGate } from "./components/authorization/playgroundAuthGate";
import ContextWrapper from "./contexts";
import CustomDashboardWrapperPage from "./customization/components/custom-DashboardWrapperPage";
import { CustomNavigate } from "./customization/components/custom-navigate";
import { BASENAME } from "./customization/config-constants";
import {
  ENABLE_CUSTOM_PARAM,
  ENABLE_KNOWLEDGE_BASES,
} from "./customization/feature-flags";
import { CustomRoutesStore } from "./customization/utils/custom-routes-store";
import { CustomRoutesStorePages } from "./customization/utils/custom-routes-store-pages";
import { AppAuthenticatedPage } from "./pages/AppAuthenticatedPage";
import { AppInitPage } from "./pages/AppInitPage";
import { AppWrapperPage } from "./pages/AppWrapperPage";
import DemoWorkspace from "./pages/DemoWorkspace";
import FlowPage from "./pages/FlowPage";
import LoginPage from "./pages/LoginPage";
import HomePage from "./pages/MainPage/pages/homePage";
import KnowledgePage from "./pages/MainPage/pages/knowledgePage";
import SourceChunksPage from "./pages/MainPage/pages/knowledgePage/sourceChunksPage/SourceChunksPage";
import CollectionPage from "./pages/MainPage/pages/main-page";
import SettingsPage from "./pages/SettingsPage";
import ApiKeysPage from "./pages/SettingsPage/pages/ApiKeysPage";
import BillingPage from "./pages/SettingsPage/pages/BillingPage";
import GeneralPage from "./pages/SettingsPage/pages/GeneralPage";
import GlobalVariablesPage from "./pages/SettingsPage/pages/GlobalVariablesPage";
import MCPServersPage from "./pages/SettingsPage/pages/MCPServersPage";
import McpClientPage from "./pages/SettingsPage/pages/McpClientPage";
import ModelProvidersPage from "./pages/SettingsPage/pages/ModelProvidersPage";
import MessagesPage from "./pages/SettingsPage/pages/messagesPage";
import ShortcutsPage from "./pages/SettingsPage/pages/ShortcutsPage";
import ViewPage from "./pages/ViewPage";

const AdminPage = lazy(() => import("./pages/AdminPage"));
const LoginAdminPage = lazy(() => import("./pages/AdminPage/LoginPage"));
const DeleteAccountPage = lazy(() => import("./pages/DeleteAccountPage"));
const CreateTeamPage = lazy(
  () => import("./pages/TeamPage/pages/createTeamPage"),
);
const JoinTeamPage = lazy(() => import("./pages/TeamPage/pages/joinTeamPage"));

const PlaygroundPage = lazy(() => import("./pages/Playground"));

const SignUp = lazy(() => import("./pages/SignUpPage"));

const router = createBrowserRouter(
  createRoutesFromElements([
    <Route path="/playground/:id/">
      <Route
        path=""
        element={
          <ContextWrapper key={1}>
            <PlaygroundAuthGate>
              <PlaygroundPage />
            </PlaygroundAuthGate>
          </ContextWrapper>
        }
      />
    </Route>,
    <Route path="/demo" element={<DemoWorkspace />} />,
    <Route
      path={ENABLE_CUSTOM_PARAM ? "/:customParam?" : "/"}
      element={
        <ContextWrapper key={2}>
          <Outlet />
        </ContextWrapper>
      }
    >
      <Route path="" element={<AppInitPage />}>
        <Route path="" element={<AppWrapperPage />}>
          <Route
            path=""
            element={
              <ProtectedRoute>
                <ProtectedTeamRoute>
                  <Outlet />
                </ProtectedTeamRoute>
              </ProtectedRoute>
            }
          >
            <Route path="create-team" element={<CreateTeamPage />} />
            <Route path="join-team" element={<JoinTeamPage />} />
            <Route path="" element={<AppAuthenticatedPage />}>
              <Route path="" element={<CustomDashboardWrapperPage />}>
                <Route path="" element={<CollectionPage />}>
                  <Route
                    index
                    element={<CustomNavigate replace to={"flows"} />}
                  />
                  {ENABLE_KNOWLEDGE_BASES && (
                    <Route path="assets">
                      <Route
                        index
                        element={
                          <CustomNavigate replace to="knowledge-bases" />
                        }
                      />
                      <Route
                        path="knowledge-bases"
                        element={<KnowledgePage />}
                      />
                      <Route
                        path="knowledge-bases/:sourceId/chunks"
                        element={<SourceChunksPage />}
                      />
                    </Route>
                  )}
                  <Route
                    path="flows/"
                    element={<HomePage key="flows" type="flows" />}
                  />
                  <Route
                    path="components/"
                    element={<HomePage key="components" type="components" />}
                  >
                    <Route
                      path="folder/:folderId"
                      element={<HomePage key="components" type="components" />}
                    />
                  </Route>
                  <Route
                    path="all/"
                    element={<HomePage key="flows" type="flows" />}
                  >
                    <Route
                      path="folder/:folderId"
                      element={<HomePage key="flows" type="flows" />}
                    />
                  </Route>
                  <Route
                    path="mcp/"
                    element={<HomePage key="mcp" type="mcp" />}
                  >
                    <Route
                      path="folder/:folderId"
                      element={<HomePage key="mcp" type="mcp" />}
                    />
                  </Route>
                </Route>
                <Route path="settings" element={<SettingsPage />}>
                  <Route
                    index
                    element={<CustomNavigate replace to={"general"} />}
                  />
                  <Route
                    path="global-variables"
                    element={<GlobalVariablesPage />}
                  />
                  <Route
                    path="model-providers"
                    element={<ModelProvidersPage />}
                  />
                  <Route path="mcp-servers" element={<MCPServersPage />} />
                  <Route path="mcp-client" element={<McpClientPage />} />

                  <Route path="api-keys" element={<ApiKeysPage />} />
                  <Route
                    path="general/:scrollId?"
                    element={
                      <AuthSettingsGuard>
                        <GeneralPage />
                      </AuthSettingsGuard>
                    }
                  />
                  <Route path="shortcuts" element={<ShortcutsPage />} />
                  <Route path="messages" element={<MessagesPage />} />
                  <Route path="billing" element={<BillingPage />} />
                  {CustomRoutesStore()}
                </Route>
                {CustomRoutesStorePages()}
                <Route path="account">
                  <Route path="delete" element={<DeleteAccountPage />} />
                </Route>
                <Route
                  path="admin"
                  element={
                    <ProtectedAdminRoute>
                      <AdminPage />
                    </ProtectedAdminRoute>
                  }
                />
              </Route>

              {/* removed for project-centric routing */}
              {/*<Route path="flow/:id/">
                <Route path="" element={<CustomDashboardWrapperPage />}>
                  <Route path="folder/:folderId/" element={<FlowPage />} />
                  <Route path="" element={<FlowPage />} />
                </Route>
                <Route path="view" element={<ViewPage />} />
              </Route>*/}

              {/* New project-centric routing */}
              <Route path="folder/:folderId/">
                <Route path="flow/:id/">
                  <Route path="" element={<CustomDashboardWrapperPage />}>
                    <Route index element={<FlowPage />} />
                  </Route>
                  <Route path="view" element={<ViewPage />} />
                </Route>
              </Route>

              {/* Backward-compat: redirect old /flow/:id URLs to /all (no folder context available) */}
              <Route
                path="flow/:id/*"
                element={<CustomNavigate replace to="/all" />}
              />
            </Route>
          </Route>
          <Route
            path="login"
            element={
              <ProtectedLoginRoute>
                <LoginPage />
              </ProtectedLoginRoute>
            }
          />
          <Route
            path="signup"
            element={
              <ProtectedLoginRoute>
                <SignUp />
              </ProtectedLoginRoute>
            }
          />
          <Route
            path="login/admin"
            element={
              <ProtectedLoginRoute>
                <LoginAdminPage />
              </ProtectedLoginRoute>
            }
          />
        </Route>
      </Route>
      <Route path="*" element={<CustomNavigate replace to="/" />} />
    </Route>,
  ]),
  { basename: BASENAME || undefined },
);

export default router;
