# backend/api/views.py

import json
import os
from datetime import datetime
from pathlib import Path

from django.conf import settings
from django.http import JsonResponse, FileResponse
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status


@api_view(['POST'])
def save_shared_context(request):
    """
    Reçoit le sharedContext depuis React et le sauvegarde localement en JSON.
    """
    try:
        data = request.data  # DRF parse automatiquement le JSON

        if not data:
            return Response(
                {'error': 'Aucune donnée reçue'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Générer un nom de fichier avec timestamp
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"shared_context_{timestamp}.json"
        filepath = settings.SHARED_CONTEXT_DIR / filename

        # Sauvegarder le JSON localement
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

        return Response({
            'success': True,
            'message': f'Contexte sauvegardé avec succès',
            'filename': filename,
            'filepath': str(filepath),
            'size': os.path.getsize(filepath)
        }, status=status.HTTP_201_CREATED)

    except Exception as e:
        return Response(
            {'error': str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
def download_shared_context(request, filename=None):
    """
    Retourne le fichier JSON pour téléchargement direct dans le navigateur.
    """
    try:
        if filename:
            # Télécharger un fichier spécifique
            filepath = settings.SHARED_CONTEXT_DIR / filename
        else:
            # Télécharger le plus récent
            files = list(settings.SHARED_CONTEXT_DIR.glob('shared_context_*.json'))
            if not files:
                return Response(
                    {'error': 'Aucun fichier trouvé'},
                    status=status.HTTP_404_NOT_FOUND
                )
            filepath = max(files, key=os.path.getmtime)

        if not filepath.exists():
            return Response(
                {'error': 'Fichier introuvable'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Retourner le fichier en téléchargement
        response = FileResponse(
            open(filepath, 'rb'),
            content_type='application/json'
        )
        response['Content-Disposition'] = f'attachment; filename="{filepath.name}"'
        return response

    except Exception as e:
        return Response(
            {'error': str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
def list_shared_contexts(request):
    """
    Liste tous les fichiers de contexte sauvegardés.
    """
    files = list(settings.SHARED_CONTEXT_DIR.glob('shared_context_*.json'))
    result = []
    for f in sorted(files, key=os.path.getmtime, reverse=True):
        result.append({
            'filename': f.name,
            'size': os.path.getsize(f),
            'created_at': datetime.fromtimestamp(os.path.getmtime(f)).isoformat()
        })
    return Response(result)