from django.urls import path

from green_analysis.api import views

app_name = "green_analysis_api"

urlpatterns = [
    path(
        "",
        views.AnalysisCreateView.as_view(),
        name="analysis-create",
    ),
    path(
        "<uuid:pk>/",
        views.AnalysisDetailView.as_view(),
        name="analysis-detail",
    ),
    path(
        "<uuid:pk>/stream/",
        views.AnalysisStreamView.as_view(),
        name="analysis-stream",
    ),
    path(
        "<uuid:pk>/followup/",
        views.AnalysisFollowUpView.as_view(),
        name="analysis-followup",
    ),
    path(
        "<uuid:pk>/report/",
        views.AnalysisReportView.as_view(),
        name="analysis-report",
    ),
]
