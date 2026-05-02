from django.http import JsonResponse


def health(request):
    return JsonResponse({"module": "savings", "status": "ok"})

# Create your views here.
