"""
API URLs for ComplianceGuard.
"""

from django.urls import include, path
from . import views

urlpatterns = [
    path("", views.api_root, name="api-root"),
    path("chat/", views.chat, name="chat"),
    path("chat/knowledge/", views.chat_knowledge, name="chat-knowledge"),
    path("upload/", views.upload_document, name="upload"),
    path("conformite/", views.conformite, name="conformite"),
    path("documents/", views.generate_documents, name="documents"),
    path("graph/", views.get_graph, name="graph"),
    path("veille/", views.get_veille, name="veille"),
    path("suggestions/", views.get_suggestions, name="suggestions"),
    # Contextual Questionnaire
    path("conformite/questionnaire/", views.generate_questionnaire, name="generate-questionnaire"),
    # MarketScout
    path("save-context/", views.save_context, name="save-context"),
    path("download-context/", views.download_context, name="download-context"),
    path("download-context/<str:filename>/", views.download_context, name="download-context-file"),
    path("list-contexts/", views.list_contexts, name="list-contexts"),
    path("avatar/", views.generate_avatar, name="avatar"),
    # Green Analysis Module
    path("green-analysis/", include("green_analysis.api.urls")),
]

