# backend/api/urls.py

from django.urls import path
from . import views
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
from .avatar_view import generate_avatar  


urlpatterns = [
    path('save-context/', views.save_shared_context, name='save-context'),
    path('download-context/', views.download_shared_context, name='download-latest'),
    path('download-context/<str:filename>/', views.download_shared_context, name='download-specific'),
    path('list-contexts/', views.list_shared_contexts, name='list-contexts'),
    path("avatar/", generate_avatar, name="generate_avatar"),
]