"""
Management command to clean all user data from the database.
Usage: python manage.py clean_user_data
"""
from django.core.management.base import BaseCommand
from api.models import Candidate, CandidateNotification, UserSession, HRUser


class Command(BaseCommand):
    help = 'Clean all user data from the database (candidates, sessions, notifications, HR users)'

    def add_arguments(self, parser):
        parser.add_argument(
            '--confirm',
            action='store_true',
            help='Confirm deletion without prompting',
        )

    def handle(self, *args, **options):
        if not options['confirm']:
            confirm = input('This will delete ALL user data. Type "yes" to confirm: ')
            if confirm.lower() != 'yes':
                self.stdout.write(self.style.WARNING('Operation cancelled.'))
                return

        # Count records before deletion
        candidates_count = Candidate.objects.count()
        notifications_count = CandidateNotification.objects.count()
        sessions_count = UserSession.objects.count()
        hr_users_count = HRUser.objects.count()

        self.stdout.write(f'Found:')
        self.stdout.write(f'  - {candidates_count} candidates')
        self.stdout.write(f'  - {notifications_count} notifications')
        self.stdout.write(f'  - {sessions_count} sessions')
        self.stdout.write(f'  - {hr_users_count} HR users')

        # Delete all records
        CandidateNotification.objects.all().delete()
        self.stdout.write(self.style.SUCCESS(f'✓ Deleted {notifications_count} notifications'))

        Candidate.objects.all().delete()
        self.stdout.write(self.style.SUCCESS(f'✓ Deleted {candidates_count} candidates'))

        UserSession.objects.all().delete()
        self.stdout.write(self.style.SUCCESS(f'✓ Deleted {sessions_count} sessions'))

        HRUser.objects.all().delete()
        self.stdout.write(self.style.SUCCESS(f'✓ Deleted {hr_users_count} HR users'))

        self.stdout.write(self.style.SUCCESS('\n✓ All user data has been cleaned successfully!'))
